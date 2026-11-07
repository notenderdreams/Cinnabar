use super::protocol::*;
use super::workspace::TempAiDirectory;
use std::fs;
use std::path::Path;

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
    let args = antigravity_arguments("Explain this equation");
    assert_eq!(args[0], "--output-format");
    assert_eq!(args[1], "json");
    assert!(args.iter().any(|a| a == "--sandbox"));
    assert!(args.iter().any(|a| a == "--disable-slash-commands"));
    assert_eq!(args.last().unwrap(), "-p=Explain this equation");
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
