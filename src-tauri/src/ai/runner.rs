use super::models::{AiExplanationRequest, AiExplanationResult};
use super::protocol::{
    antigravity_arguments, codex_arguments, parse_ai_output, NOTEBOOK_RESPONSE_SCHEMA,
};
use super::providers::resolve_active_provider;
use super::workspace::create_workspace;
use anyhow::Context;
use base64::Engine;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const EXPLANATION_TIMEOUT: Duration = Duration::from_secs(180);
const RESPONSE_SCHEMA: &str = r#"{"type":"object","properties":{"explanation":{"type":"string"}},"required":["explanation"],"additionalProperties":false}"#;

#[derive(Default)]
pub struct AiRunnerState {
    pub(super) preferred_provider_id: Mutex<Option<String>>,
    pub(super) custom_executable: Mutex<Option<PathBuf>>,
    pub(super) processes: Mutex<HashMap<String, SharedChild>>,
    pub(super) cancellations: Mutex<HashSet<String>>,
}

type SharedChild = Arc<Mutex<Option<Child>>>;

impl Drop for AiRunnerState {
    fn drop(&mut self) {
        if let Ok(processes) = self.processes.lock() {
            for process in processes.values() {
                kill_process(process);
            }
        }
    }
}

fn ai_error(code: &str, message: impl Into<String>) -> AiExplanationResult {
    AiExplanationResult {
        ok: false,
        response: None,
        code: Some(code.to_string()),
        message: Some(message.into()),
    }
}

fn process_failure(error: anyhow::Error, message: impl Into<String>) -> AiExplanationResult {
    log::error!("{error:#}");
    ai_error("process_failed", message)
}

fn kill_process(process: &SharedChild) {
    if let Ok(mut child) = process.lock() {
        if let Some(child) = child.as_mut() {
            let _ = child.kill();
        }
    }
}

fn request_was_cancelled(state: &AiRunnerState, request_id: &str) -> bool {
    state
        .cancellations
        .lock()
        .map(|mut values| values.remove(request_id))
        .unwrap_or(false)
}

pub(crate) async fn run_ai_explanation(
    request: AiExplanationRequest,
    state: &AiRunnerState,
) -> AiExplanationResult {
    if request_was_cancelled(state, &request.request_id) {
        return ai_error("cancelled", "Explanation cancelled.");
    }

    let active = resolve_active_provider(state);
    if active.status != "ready" {
        return ai_error(
            &active.status,
            active
                .message
                .unwrap_or_else(|| "The selected AI CLI is not ready.".to_string()),
        );
    }
    let Some(executable_str) = active.executable else {
        return ai_error(
            "missing_cli",
            "No AI executable is available. Please select one in Settings.",
        );
    };
    let executable = PathBuf::from(&executable_str);
    let provider_id = active.provider.unwrap_or_else(|| "antigravity".to_string());

    let temporary = match create_workspace(&request.request_id) {
        Ok(value) => value,
        Err(error) => {
            return process_failure(error, "Could not create temporary AI workspace.");
        }
    };
    let crop_path = temporary.0.join("region.png");
    let schema_path = temporary.0.join("response-schema.json");
    let output_path = temporary.0.join("response.json");
    let diagnostics_path = temporary.0.join("diagnostics.txt");

    let encoded = request
        .png_data_url
        .split_once(',')
        .map(|(_, data)| data)
        .unwrap_or(&request.png_data_url);
    let crop = match base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .context("selected region image was not valid base64")
    {
        Ok(value) => value,
        Err(error) => return process_failure(error, "The selected region image was invalid."),
    };
    if let Err(error) = fs::write(&crop_path, crop)
        .with_context(|| format!("failed to write region image to {}", crop_path.display()))
        .and_then(|_| {
            let schema = if request.response_format.is_some() {
                NOTEBOOK_RESPONSE_SCHEMA
            } else {
                RESPONSE_SCHEMA
            };
            fs::write(&schema_path, schema).with_context(|| {
                format!(
                    "failed to write response schema to {}",
                    schema_path.display()
                )
            })
        })
    {
        return process_failure(error, "Could not prepare the temporary AI request.");
    }
    let diagnostics = match fs::File::create(&diagnostics_path)
        .with_context(|| format!("failed to create {}", diagnostics_path.display()))
    {
        Ok(value) => value,
        Err(error) => return process_failure(error, "Could not prepare AI diagnostics."),
    };

    let mut command = Command::new(&executable);
    let is_antigravity = provider_id == "antigravity"
        || executable_str.to_lowercase().contains("agy")
        || executable_str.to_lowercase().contains("antigravity");

    let child = if is_antigravity {
        let out_file = match fs::File::create(&output_path)
            .with_context(|| format!("failed to create {}", output_path.display()))
        {
            Ok(value) => value,
            Err(error) => return process_failure(error, "Could not prepare output file."),
        };

        command
            .args(antigravity_arguments(&request.prompt))
            .current_dir(&temporary.0)
            .stdout(Stdio::from(out_file))
            .stderr(Stdio::from(diagnostics));

        match command
            .spawn()
            .with_context(|| format!("failed to start Antigravity at {}", executable.display()))
        {
            Ok(value) => value,
            Err(error) => return process_failure(error, "Could not start Antigravity CLI."),
        }
    } else {
        command
            .args(codex_arguments(
                &crop_path,
                &schema_path,
                &output_path,
                &temporary.0,
            ))
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::from(diagnostics));

        let mut spawned = match command
            .spawn()
            .with_context(|| format!("failed to start Codex at {}", executable.display()))
        {
            Ok(value) => value,
            Err(error) => return process_failure(error, "Could not start Codex CLI."),
        };

        let prompt_result = spawned
            .stdin
            .as_mut()
            .context("Codex stdin was not available")
            .and_then(|stdin| {
                stdin
                    .write_all(request.prompt.as_bytes())
                    .context("failed to write the prompt to Codex")
            });
        if let Err(error) = prompt_result {
            let _ = spawned.kill();
            return process_failure(error, "Could not send the explanation prompt to Codex.");
        }
        drop(spawned.stdin.take());
        spawned
    };

    let process = Arc::new(Mutex::new(Some(child)));
    if let Ok(mut processes) = state.processes.lock() {
        processes.insert(request.request_id.clone(), process.clone());
    }
    if request_was_cancelled(state, &request.request_id) {
        kill_process(&process);
        if let Ok(mut processes) = state.processes.lock() {
            processes.remove(&request.request_id);
        }
        return ai_error("cancelled", "Explanation cancelled.");
    }

    let started = Instant::now();
    let mut cancelled = false;
    let mut timed_out = false;
    let exit_status = loop {
        if state
            .processes
            .lock()
            .map(|processes| !processes.contains_key(&request.request_id))
            .unwrap_or(true)
        {
            cancelled = true;
        }
        if started.elapsed() >= EXPLANATION_TIMEOUT {
            timed_out = true;
            kill_process(&process);
        }
        let polled = process.lock().ok().and_then(|mut value| {
            value
                .as_mut()
                .and_then(|child| child.try_wait().ok().flatten())
        });
        if let Some(status) = polled {
            break status;
        }
        tokio::time::sleep(Duration::from_millis(if timed_out { 30 } else { 60 })).await;
    };

    if let Ok(mut processes) = state.processes.lock() {
        processes.remove(&request.request_id);
    }
    if let Ok(mut value) = process.lock() {
        if let Some(mut child) = value.take() {
            let _ = child.wait();
        }
    }
    if timed_out {
        return ai_error("timeout", "AI CLI did not respond within three minutes.");
    }
    if cancelled {
        return ai_error("cancelled", "Explanation cancelled.");
    }
    if !exit_status.success() {
        let diagnostic = fs::read_to_string(&diagnostics_path).unwrap_or_default();
        let capped: String = diagnostic.chars().take(4_000).collect();
        return ai_error(
            "process_failed",
            if capped.trim().is_empty() {
                "AI CLI exited without producing an explanation.".into()
            } else {
                capped
            },
        );
    }

    match fs::read_to_string(&output_path)
        .with_context(|| format!("failed to read AI response from {}", output_path.display()))
        .and_then(|contents| parse_ai_output(&contents))
    {
        Ok(response) => AiExplanationResult {
            ok: true,
            response: Some(response),
            code: None,
            message: None,
        },
        Err(error) => {
            log::error!("{error:#}");
            ai_error(
                "malformed_output",
                "AI CLI returned an unreadable response. Try again.",
            )
        }
    }
}

pub(crate) fn cancel_ai_explanation(request_id: String, state: &AiRunnerState) -> bool {
    let process = state
        .processes
        .lock()
        .ok()
        .and_then(|mut processes| processes.remove(&request_id));
    if let Some(process) = process {
        if let Ok(mut value) = process.lock() {
            if let Some(child) = value.as_mut() {
                return child.kill().is_ok();
            }
        }
    }
    if let Ok(mut cancellations) = state.cancellations.lock() {
        cancellations.insert(request_id);
    }
    true
}
