// Default IPC answers for rendering the real app in tests, derived from the
// return types of the `invoke` calls in src. Every other command answers
// `null` unless a test routes it.
const EMPTY_LIST = new Set([
  "automation_runs_list",
  "automation_runs_recover",
  "automations_list",
  "azure_devops_list_todos",
  "azure_devops_list_work_items",
  "clipboard_file_paths",
  "confluence_list_children",
  "confluence_list_spaces",
  "confluence_search",
  "cursor_subagent_runs",
  "cursor_tool_calls",
  "git_commit_files",
  "git_github_repositories",
  "git_github_work_items",
  "gitlab_list_todos",
  "gitlab_list_work_items",
  "inspect_paths",
  "jira_list_issues",
  "jira_list_projects",
  "linear_list_issues",
  "linear_list_teams",
  "list_dir",
  "list_external_editors",
  "list_project_files",
  "list_skills",
  "mcp_discover",
  "notes_list",
  "omp_active_assistant_texts",
  "omp_session_interjections",
  "read_file_preview",
  "reminder_list",
  "remote_machines",
  "session_list_by_project",
  "session_list_in_flight",
  "session_list_linked",
  "session_take_in_flight",
  "stat_files",
]);

const FALSE = new Set([
  "harness_update_check_claim",
  "quick_composer_prepare",
  "session_checkpoint_cleanup_safe",
]);

const EMPTY_TEXT = new Set([
  "app_cli_path",
  "azure_devops_repo",
  "azure_devops_work_item_comment",
  "claude_mcp_list",
  "clone_repo",
  "control_attach_worker",
  "copy_path",
  "create_path",
  "default_cwd",
  "git_checkout",
  "git_create_branch",
  "git_github_repo",
  "git_github_work_item_comment",
  "git_head_message",
  "git_pr_create",
  "gitlab_repo",
  "gitlab_work_item_comment",
  "harness_latest_version",
  "home_dir",
  "jira_issue_comment",
  "linear_issue_comment",
  "move_path",
  "notes_image_path",
  "read_file_base64",
  "read_text_file",
  "remote_ssh_begin",
  "remote_ssh_reconnect",
  "rename_path",
  "save_chat_background",
  "save_project_chat_background",
  "save_project_logo",
  "write_attachment",
]);

const EMPTY_RECORD = new Set(["claude_shell_commands"]);

const ZERO = new Set(["harness_free_port", "harness_spawn"]);

export function defaultIpcAnswer(command: string): unknown {
  if (EMPTY_LIST.has(command)) return [];
  if (FALSE.has(command)) return false;
  if (EMPTY_TEXT.has(command)) return "";
  if (EMPTY_RECORD.has(command)) return {};
  if (ZERO.has(command)) return 0;
  return null;
}
