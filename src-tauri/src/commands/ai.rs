use super::error::CommandResult;
use crate::ai::{self, AiExplanationRequest, AiExplanationResult, AiProviderStatus, AiRunnerState};

#[tauri::command]
#[specta::specta]
pub async fn get_ai_provider_status(
    state: tauri::State<'_, AiRunnerState>,
) -> CommandResult<AiProviderStatus> {
    Ok(ai::get_ai_provider_status(&state))
}

#[tauri::command]
#[specta::specta]
pub async fn set_ai_provider_preference(
    provider_id: String,
    executable_path: Option<String>,
    state: tauri::State<'_, AiRunnerState>,
) -> CommandResult<AiProviderStatus> {
    Ok(ai::set_ai_provider_preference(
        provider_id,
        executable_path,
        &state,
    ))
}

#[tauri::command]
#[specta::specta]
pub async fn set_ai_provider_executable(
    executable_path: String,
    state: tauri::State<'_, AiRunnerState>,
) -> CommandResult<AiProviderStatus> {
    Ok(ai::set_ai_provider_executable(executable_path, &state))
}

#[tauri::command]
#[specta::specta]
pub async fn run_ai_explanation(
    request: AiExplanationRequest,
    state: tauri::State<'_, AiRunnerState>,
) -> CommandResult<AiExplanationResult> {
    Ok(ai::run_ai_explanation(request, &state).await)
}

#[tauri::command]
#[specta::specta]
pub fn cancel_ai_explanation(request_id: String, state: tauri::State<'_, AiRunnerState>) -> bool {
    ai::cancel_ai_explanation(request_id, &state)
}
