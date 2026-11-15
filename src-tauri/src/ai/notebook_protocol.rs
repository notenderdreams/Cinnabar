use anyhow::{ensure, Result};
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct NotebookEdit {
    op: String,
    target_id: Option<String>,
    anchor_id: Option<String>,
    content: Option<BlockContent>,
    style: Option<BlockStyle>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BlockContent {
    kind: String,
    text: Option<String>,
    title: Option<String>,
    columns: Option<Vec<String>>,
    attachment_id: Option<String>,
    reference_id: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BlockStyle {
    font_size: Option<f64>,
    color: Option<String>,
    background: Option<String>,
    text_align: Option<String>,
}

fn bounded(value: &Option<String>, limit: usize) -> bool {
    value
        .as_ref()
        .is_none_or(|text| text.chars().count() <= limit)
}
fn color(value: &Option<String>) -> bool {
    value.as_ref().is_none_or(|color| {
        color.len() == 7
            && color.starts_with('#')
            && color[1..].bytes().all(|byte| byte.is_ascii_hexdigit())
    })
}

pub(super) fn validate_edits(edits: &[NotebookEdit]) -> Result<()> {
    ensure!(
        !edits.is_empty() && edits.len() <= 30,
        "Invalid notebook edit count"
    );
    ensure!(
        serde_json::to_vec(edits)?.len() <= 60_000,
        "Notebook edit batch is too large"
    );
    for edit in edits {
        ensure!(
            [
                "append",
                "prepend",
                "insert_before",
                "insert_after",
                "replace",
                "delete",
                "move_before",
                "move_after",
                "format"
            ]
            .contains(&edit.op.as_str()),
            "Invalid notebook edit operation"
        );
        ensure!(
            bounded(&edit.target_id, 20_000) && bounded(&edit.anchor_id, 20_000),
            "Invalid block ID"
        );
        let creates = [
            "append",
            "prepend",
            "insert_before",
            "insert_after",
            "replace",
        ]
        .contains(&edit.op.as_str());
        ensure!(
            creates == edit.content.is_some() && (edit.op == "format") == edit.style.is_some(),
            "Invalid edit payload"
        );
        if !["append", "prepend"].contains(&edit.op.as_str()) {
            ensure!(
                edit.target_id.as_ref().is_some_and(|id| !id.is_empty()),
                "Missing target block"
            );
        }
        if edit.op.starts_with("move_") {
            ensure!(
                edit.anchor_id.as_ref().is_some_and(|id| !id.is_empty()),
                "Missing destination block"
            );
        }
        if let Some(content) = &edit.content {
            ensure!(
                [
                    "markdown",
                    "callout",
                    "toggle",
                    "columns",
                    "contents",
                    "pageBreak",
                    "image",
                    "reference"
                ]
                .contains(&content.kind.as_str()),
                "Invalid block kind"
            );
            ensure!(
                bounded(&content.text, 20_000)
                    && bounded(&content.title, 20_000)
                    && bounded(&content.attachment_id, 20_000)
                    && bounded(&content.reference_id, 20_000),
                "Block content is too large"
            );
            if let Some(columns) = &content.columns {
                ensure!(
                    (2..=3).contains(&columns.len())
                        && columns.iter().all(|text| text.chars().count() <= 20_000),
                    "Invalid notebook columns"
                );
            }
            ensure!(
                content.kind != "columns" || content.columns.is_some(),
                "Missing columns"
            );
        }
        if let Some(style) = &edit.style {
            ensure!(
                style
                    .font_size
                    .is_none_or(|size| size.is_finite() && (8.0..=72.0).contains(&size)),
                "Invalid font size"
            );
            ensure!(
                color(&style.color) && color(&style.background),
                "Invalid block color"
            );
            ensure!(
                style
                    .text_align
                    .as_ref()
                    .is_none_or(
                        |align| ["left", "center", "right", "justify"].contains(&align.as_str())
                    ),
                "Invalid text alignment"
            );
        }
    }
    Ok(())
}
