use super::models::{AiProviderStatus, DiscoveredAiProvider};
use super::AiRunnerState;
use crate::platform::home_directory;
use std::path::{Path, PathBuf};
use std::process::Command;

fn standard_candidate_paths(bin_names: &[&str]) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(path_value) = std::env::var_os("PATH") {
        for directory in std::env::split_paths(&path_value) {
            for name in bin_names {
                let file_name = if cfg!(windows) {
                    format!("{}.exe", name)
                } else {
                    (*name).to_string()
                };
                candidates.push(directory.join(file_name));
            }
        }
    }
    if let Some(home) = home_directory() {
        for name in bin_names {
            let file_name = if cfg!(windows) {
                format!("{}.exe", name)
            } else {
                (*name).to_string()
            };
            candidates.push(home.join(".local/bin").join(&file_name));
            candidates.push(home.join(".cargo/bin").join(&file_name));
            candidates.push(home.join(".bun/bin").join(&file_name));
            candidates.push(home.join(".npm-global/bin").join(&file_name));
            candidates.push(home.join(".local/share/mise/shims").join(&file_name));
        }
    }
    for name in bin_names {
        candidates.push(PathBuf::from(format!("/opt/homebrew/bin/{}", name)));
        candidates.push(PathBuf::from(format!("/usr/local/bin/{}", name)));
    }
    candidates
}

fn discover_antigravity(manual: Option<PathBuf>) -> Option<PathBuf> {
    if let Some(path) = manual.filter(|p| p.is_file()) {
        return Some(path);
    }
    standard_candidate_paths(&["agy", "antigravity"])
        .into_iter()
        .find(|candidate| candidate.is_file())
}

fn discover_codex(manual: Option<PathBuf>) -> Option<PathBuf> {
    if let Some(path) = manual.filter(|p| p.is_file()) {
        return Some(path);
    }
    standard_candidate_paths(&["codex"])
        .into_iter()
        .find(|candidate| candidate.is_file())
}

fn check_antigravity_executable(executable: &Path) -> DiscoveredAiProvider {
    let version = match Command::new(executable).arg("--version").output() {
        Ok(output) if output.status.success() => {
            let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if text.is_empty() {
                None
            } else {
                Some(text)
            }
        }
        _ => None,
    };

    let (status, message) = if version.is_some() {
        ("ready".to_string(), None)
    } else {
        (
            "incompatible_cli".to_string(),
            Some("The selected Antigravity CLI could not run `agy --version`.".to_string()),
        )
    };

    DiscoveredAiProvider {
        id: "antigravity".to_string(),
        name: "Antigravity CLI (agy)".to_string(),
        executable: executable.to_string_lossy().into_owned(),
        version,
        status,
        message,
    }
}

fn check_codex_executable(executable: &Path) -> DiscoveredAiProvider {
    let version = match Command::new(executable).arg("--version").output() {
        Ok(output) if output.status.success() => {
            let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if text.is_empty() {
                None
            } else {
                Some(text)
            }
        }
        _ => None,
    };

    let supports_required_options = Command::new(executable)
        .args(["exec", "--help"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| {
            let help_text = String::from_utf8_lossy(&output.stdout);
            [
                "--ephemeral",
                "--ignore-user-config",
                "--ignore-rules",
                "--output-schema",
                "--output-last-message",
            ]
            .iter()
            .all(|option| help_text.contains(option))
        })
        .unwrap_or(false);

    if !supports_required_options {
        return DiscoveredAiProvider {
            id: "codex".to_string(),
            name: "Codex CLI".to_string(),
            executable: executable.to_string_lossy().into_owned(),
            version,
            status: "incompatible_cli".to_string(),
            message: Some(
                "This Codex CLI version does not support required non-interactive options."
                    .to_string(),
            ),
        };
    }

    if !matches!(Command::new(executable).args(["login", "status"]).output(), Ok(output) if output.status.success())
    {
        return DiscoveredAiProvider {
            id: "codex".to_string(),
            name: "Codex CLI".to_string(),
            executable: executable.to_string_lossy().into_owned(),
            version,
            status: "unauthenticated".to_string(),
            message: Some(
                "Codex is installed but not logged in. Run `codex login` and try again."
                    .to_string(),
            ),
        };
    }

    DiscoveredAiProvider {
        id: "codex".to_string(),
        name: "Codex CLI".to_string(),
        executable: executable.to_string_lossy().into_owned(),
        version,
        status: "ready".to_string(),
        message: None,
    }
}

fn check_custom_executable(executable: &Path) -> DiscoveredAiProvider {
    let file_name = executable
        .file_name()
        .map(|f| f.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if file_name.contains("agy") || file_name.contains("antigravity") {
        let mut provider = check_antigravity_executable(executable);
        provider.id = "custom".to_string();
        provider.name = format!("Custom ({})", executable.display());
        return provider;
    }
    if file_name.contains("codex") {
        let mut provider = check_codex_executable(executable);
        provider.id = "custom".to_string();
        provider.name = format!("Custom ({})", executable.display());
        return provider;
    }

    let version = Command::new(executable)
        .arg("--version")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| {
            let text = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if text.is_empty() {
                None
            } else {
                Some(text)
            }
        });

    DiscoveredAiProvider {
        id: "custom".to_string(),
        name: format!("Custom ({})", executable.display()),
        executable: executable.to_string_lossy().into_owned(),
        version,
        status: "ready".to_string(),
        message: None,
    }
}

pub(super) fn scan_all_providers(custom: Option<PathBuf>) -> Vec<DiscoveredAiProvider> {
    let mut list = Vec::new();

    if let Some(custom_path) = custom {
        if custom_path.is_file() {
            list.push(check_custom_executable(&custom_path));
        }
    }

    if let Some(agy_path) = discover_antigravity(None) {
        list.push(check_antigravity_executable(&agy_path));
    }

    if let Some(codex_path) = discover_codex(None) {
        list.push(check_codex_executable(&codex_path));
    }

    list
}

pub(super) fn resolve_active_provider(state: &AiRunnerState) -> AiProviderStatus {
    let custom = state.custom_executable.lock().ok().and_then(|c| c.clone());
    let preferred = state
        .preferred_provider_id
        .lock()
        .ok()
        .and_then(|p| p.clone());
    let available = scan_all_providers(custom);

    if available.is_empty() {
        return AiProviderStatus {
            status: "missing_cli".to_string(),
            provider: None,
            version: None,
            executable: None,
            message: Some(
                "No supported AI CLI was found. Please install Antigravity CLI (agy) or Codex."
                    .to_string(),
            ),
            available_providers: Vec::new(),
        };
    }

    let selected = if let Some(pref_id) = preferred {
        available
            .iter()
            .find(|p| p.id == pref_id)
            .cloned()
            .or_else(|| available.iter().find(|p| p.status == "ready").cloned())
            .unwrap_or_else(|| available[0].clone())
    } else {
        available
            .iter()
            .find(|p| p.status == "ready")
            .cloned()
            .unwrap_or_else(|| available[0].clone())
    };

    AiProviderStatus {
        status: selected.status.clone(),
        provider: Some(selected.id.clone()),
        version: selected.version.clone(),
        executable: Some(selected.executable.clone()),
        message: selected.message.clone(),
        available_providers: available,
    }
}
