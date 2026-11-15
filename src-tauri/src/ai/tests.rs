use super::protocol::*;
use super::workspace::TempAiDirectory;
use std::fs;
use std::path::Path;

#[test]
fn notebook_reply_with_omitted_unused_fields_is_normalized() {
    let action = serde_json::json!({
        "op":"append", "targetId":null, "anchorId":null, "style":null,
        "content":{"kind":"markdown","text":"# Structured note\n\nA short overview.","title":null,"columns":null,"attachmentId":null,"referenceId":null}
    });
    let reply = serde_json::json!({"message":"Prepared notes","notebookEdits":[action]});
    for payload in [
        reply.clone(),
        serde_json::json!({"status":"SUCCESS","response":reply.clone()}),
        serde_json::json!({"status":"SUCCESS","structured_output":reply.clone(),"response":"Prepared notes"}),
    ] {
        let parsed = parse_ai_output(&payload.to_string())
            .expect("valid notebook edits must not be rejected as a missing explanation");
        let normalized: serde_json::Value = serde_json::from_str(&parsed).unwrap();
        assert!(normalized["notebookText"].is_null());
        assert!(normalized["notebookImage"].is_null());
        assert!(normalized["notebookEdits"].is_array());
    }
    let mut invalid = reply;
    invalid["notebookEdits"][0]["op"] = serde_json::json!("run_shell");
    assert!(parse_ai_output(&invalid.to_string()).is_err());
}

#[test]
fn antigravity_schema_response_prefers_validated_notebook_content() {
    // Minimal envelope from the installed Antigravity CLI's --json-schema output.
    let payload = serde_json::json!({
        "conversation_id":"synthetic", "status":"SUCCESS", "response":"Prepared notes",
        "structured_output":{"message":"Prepared notes","notebookText":"# Test note\n\nA short structured note.","notebookImage":null,"notebookEdits":null},
        "num_turns":2
    });
    let parsed = parse_ai_output(&payload.to_string()).unwrap();
    let reply: serde_json::Value = serde_json::from_str(&parsed).unwrap();
    assert_eq!(
        reply["notebookText"],
        "# Test note\n\nA short structured note."
    );
}

#[test]
fn structured_notebook_edits_are_bounded_and_validated() {
    let action = serde_json::json!({
        "op":"append", "targetId":null, "anchorId":null, "style":null,
        "content":{"kind":"columns","text":null,"title":null,"columns":["$x$", "\\[y^2\\]"],"attachmentId":null,"referenceId":null}
    });
    let reply = serde_json::json!({"message":"Prepared notes","notebookText":null,"notebookImage":null,"notebookEdits":[action.clone()]});
    assert!(parse_ai_output(&reply.to_string()).is_ok());
    let mut invalid = reply.clone();
    invalid["notebookEdits"][0]["op"] = serde_json::json!("shell");
    assert!(parse_ai_output(&invalid.to_string()).is_err());
    let mut mixed = reply.clone();
    mixed["notebookText"] = serde_json::json!("extra action");
    assert!(parse_ai_output(&mixed.to_string()).is_err());
    let mut large = reply;
    large["notebookEdits"] = serde_json::json!(vec![action; 31]);
    assert!(parse_ai_output(&large.to_string()).is_err());
}

#[test]
fn notebook_image_response_is_accepted_without_an_explanation_wrapper() {
    let response = r#"{"message":"Place the image below the title.","notebookText":null,"notebookImage":{"attachmentId":"clip-1","pageNumber":1,"placement":"after_title"}}"#;
    assert!(parse_ai_output(response).is_ok());
    let wrapped = format!(r#"{{"status":"SUCCESS","structured_output":{response}}}"#);
    assert!(parse_ai_output(&wrapped).is_ok());
}

#[test]
fn invalid_notebook_actions_are_rejected() {
    for response in [
        r#"{"message":"ok","notebookText":null,"notebookImage":{"attachmentId":"clip","pageNumber":0,"placement":"after_title"}}"#,
        r#"{"message":"ok","notebookText":null,"notebookImage":{"attachmentId":"clip","pageNumber":1,"placement":"delete"}}"#,
        r#"{"message":"ok","notebookText":"new text","notebookImage":{"attachmentId":"clip","pageNumber":1,"placement":"end"}}"#,
        r#"{"message":"ok","notebookText":null,"deletePage":1}"#,
    ] {
        assert!(parse_ai_output(response).is_err(), "accepted {response}");
    }
}

#[test]
fn codex_execution_keeps_restricted_arguments_and_stdin_input() {
    let args = codex_arguments(
        Path::new("region.png"),
        Path::new("schema.json"),
        Path::new("response.json"),
        Path::new("workspace"),
    );
    assert_eq!(args.first().unwrap(), "exec");
    assert_eq!(args.last().unwrap(), "-");
    for flag in [
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--skip-git-repo-check",
    ] {
        assert!(args.iter().any(|arg| arg == flag));
    }
    for (flag, value) in [
        ("--config", "approval_policy=\"never\""),
        ("--sandbox", "read-only"),
        ("--image", "region.png"),
        ("--output-schema", "schema.json"),
        ("--output-last-message", "response.json"),
        ("--cd", "workspace"),
    ] {
        assert!(args
            .windows(2)
            .any(|pair| pair[0] == flag && pair[1] == value));
    }
}

#[test]
fn malformed_or_empty_structured_responses_are_rejected() {
    for contents in [
        "not JSON",
        "{}",
        "[]",
        r#"{"explanation":"  "}"#,
        r#"{"explanation":123}"#,
    ] {
        assert!(parse_ai_output(contents).is_err(), "accepted {contents}");
    }
}

#[test]
fn antigravity_arguments_construction() {
    let args = antigravity_arguments("Explain this equation", None);
    assert_eq!(args[0], "--output-format");
    assert_eq!(args[1], "json");
    assert!(args.iter().any(|a| a == "--sandbox"));
    assert!(args.iter().any(|a| a == "--disable-slash-commands"));
    assert_eq!(args.last().unwrap(), "-p=Explain this equation");
    assert!(!args.iter().any(|arg| arg == "--json-schema"));
    let notebook_args = antigravity_arguments("Write notes", Some(Path::new("schema.json")));
    assert!(notebook_args
        .windows(2)
        .any(|pair| pair[0] == "--json-schema" && pair[1] == "schema.json"));
}

#[test]
fn parses_antigravity_and_codex_output() {
    // Antigravity standard response
    assert_eq!(
        parse_ai_output(r#"{"status":"SUCCESS","response":"Clear explanation"}"#).unwrap(),
        "Clear explanation"
    );
    // Antigravity structured response
    assert_eq!(
        parse_ai_output(r#"{"status":"SUCCESS","response":"Fallback","structured_output":{"explanation":"Structured answer"}}"#).unwrap(),
        "Structured answer"
    );
    // Codex schema output
    assert_eq!(
        parse_ai_output(r#"{"explanation":"Clear answer"}"#).unwrap(),
        "Clear answer"
    );
    // Antigravity error
    assert!(parse_ai_output(r#"{"status":"ERROR","error":"Token limit"}"#).is_err());
    assert!(parse_ai_output("").is_err());
}

#[test]
fn temporary_directory_guard_removes_files() {
    let path =
        std::env::temp_dir().join(format!("cinnabar-ai-cleanup-test-{}", std::process::id()));
    let _ = fs::remove_dir_all(&path);
    fs::create_dir(&path).unwrap();
    fs::write(path.join("region.png"), b"temporary").unwrap();
    drop(TempAiDirectory(path.clone()));
    assert!(!path.exists());
}
