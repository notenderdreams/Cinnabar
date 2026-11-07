//! Local AI provider discovery and cancellable explanation execution.

mod models;
mod protocol;
mod providers;
mod runner;
mod workspace;

pub(crate) use models::{AiExplanationRequest, AiExplanationResult, AiProviderStatus};
use providers::{resolve_active_provider, scan_all_providers};
pub(crate) use runner::{cancel_ai_explanation, run_ai_explanation, AiRunnerState};
use std::path::PathBuf;

pub(crate) fn get_ai_provider_status(state: &AiRunnerState) -> AiProviderStatus {
    resolve_active_provider(state)
}

pub(crate) fn set_ai_provider_preference(
    provider_id: String,
    executable_path: Option<String>,
    state: &AiRunnerState,
) -> AiProviderStatus {
    if let Ok(mut pref) = state.preferred_provider_id.lock() {
        *pref = Some(provider_id);
    }
    if let Some(path_str) = executable_path {
        let p = PathBuf::from(path_str);
        if p.is_file() {
            if let Ok(mut custom) = state.custom_executable.lock() {
                *custom = Some(p);
            }
        }
    }
    resolve_active_provider(state)
}

pub(crate) fn set_ai_provider_executable(
    executable_path: String,
    state: &AiRunnerState,
) -> AiProviderStatus {
    let path = PathBuf::from(&executable_path);
    if !path.is_absolute() || !path.is_file() {
        return AiProviderStatus {
            status: "missing_cli".to_string(),
            provider: None,
            version: None,
            executable: None,
            message: Some("Select an existing absolute path to an AI executable.".to_string()),
            available_providers: scan_all_providers(None),
        };
    }

    if let Ok(mut custom) = state.custom_executable.lock() {
        *custom = Some(path);
    }
    if let Ok(mut pref) = state.preferred_provider_id.lock() {
        *pref = Some("custom".to_string());
    }

    resolve_active_provider(state)
}

#[cfg(test)]
mod tests;
