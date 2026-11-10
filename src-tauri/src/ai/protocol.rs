use anyhow::{Context, Result};
use std::path::Path;

pub(super) const NOTEBOOK_RESPONSE_SCHEMA: &str = include_str!("notebook-response.schema.json");

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NotebookReply {
    message: String,
    notebook_text: Option<String>,
    #[serde(default)]
    notebook_image: Option<NotebookImage>,
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NotebookImage {
    attachment_id: String,
    page_number: Option<u32>,
    placement: ImagePlacement,
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "snake_case")]
enum ImagePlacement {
    AfterTitle,
    End,
}

pub(super) fn antigravity_arguments(prompt: &str) -> Vec<String> {
    vec![
        "--output-format".into(),
        "json".into(),
        "--disable-slash-commands".into(),
        "--sandbox".into(),
        format!("-p={}", prompt),
    ]
}

pub(super) fn codex_arguments(
    crop: &Path,
    schema: &Path,
    output: &Path,
    working_directory: &Path,
) -> Vec<String> {
    vec![
        "exec".into(),
        "--ephemeral".into(),
        "--ignore-user-config".into(),
        "--ignore-rules".into(),
        "--config".into(),
        "approval_policy=\"never\"".into(),
        "--sandbox".into(),
        "read-only".into(),
        "--skip-git-repo-check".into(),
        "--cd".into(),
        working_directory.to_string_lossy().into(),
        "--image".into(),
        crop.to_string_lossy().into(),
        "--output-schema".into(),
        schema.to_string_lossy().into(),
        "--output-last-message".into(),
        output.to_string_lossy().into(),
        "--color".into(),
        "never".into(),
        "-".into(),
    ]
}

pub(super) fn parse_ai_output(contents: &str) -> Result<String> {
    let trimmed = contents.trim();
    if trimmed.is_empty() {
        anyhow::bail!("AI CLI produced empty output");
    }

    let value: serde_json::Value =
        serde_json::from_str(trimmed).context("AI CLI response was not valid JSON")?;

    if value.get("message").is_some() && value.get("notebookText").is_some() {
        let reply: NotebookReply =
            serde_json::from_value(value).context("Invalid notebook response")?;
        anyhow::ensure!(!reply.message.trim().is_empty(), "Empty notebook reply");
        if let Some(text) = &reply.notebook_text {
            anyhow::ensure!(
                !text.trim().is_empty() && text.chars().count() <= 20_000,
                "Invalid note text"
            );
        }
        anyhow::ensure!(
            reply.notebook_text.is_none() || reply.notebook_image.is_none(),
            "Only one notebook action is allowed per response"
        );
        if let Some(image) = &reply.notebook_image {
            anyhow::ensure!(
                !image.attachment_id.trim().is_empty() && image.attachment_id.len() <= 200,
                "Invalid image attachment ID"
            );
            anyhow::ensure!(image.page_number != Some(0), "Invalid note page number");
        }
        return serde_json::to_string(&reply).context("Could not serialize notebook response");
    }
    if value.get("status").is_none()
        || value.get("status").and_then(|status| status.as_str()) == Some("SUCCESS")
    {
        if let Some(response) = value.get("response") {
            if response.is_object() && response.get("message").is_some() {
                return parse_ai_output(&response.to_string());
            }
        }
    }

    // Check if it's an Antigravity CLI payload
    if let Some(status) = value.get("status").and_then(|s| s.as_str()) {
        if status != "SUCCESS" {
            let err = value
                .get("error")
                .and_then(|e| e.as_str())
                .unwrap_or("Antigravity CLI returned an error status");
            anyhow::bail!("{err}");
        }
        if let Some(structured) = value.get("structured_output") {
            if structured.get("message").is_some() {
                return parse_ai_output(&structured.to_string());
            }
        }
        if let Some(structured) = value
            .get("structured_output")
            .and_then(|s| s.get("explanation"))
            .and_then(|e| e.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            return Ok(structured.to_string());
        }
        if let Some(response) = value
            .get("response")
            .and_then(|r| r.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            return Ok(response.to_string());
        }
    }

    // Check if it's a Codex schema payload {"explanation": "..."}
    if let Some(explanation) = value
        .get("explanation")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Ok(explanation.to_string());
    }

    // Generic fallback for any {"response": "..."} JSON
    if let Some(response) = value
        .get("response")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Ok(response.to_string());
    }

    anyhow::bail!("AI response did not contain a non-empty explanation")
}
