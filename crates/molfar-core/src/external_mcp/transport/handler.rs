use super::Call;
use crate::external_mcp::{constants::DISPATCH_DEADLINE, tools, types::Principal};
use rmcp::{
    model::{
        CallToolRequestParams, CallToolResponse, CallToolResult, ContentBlock, Implementation,
        ListToolsResult, PaginatedRequestParams, ServerCapabilities, ServerConfig, Tool,
    },
    service::{RequestContext, RoleServer},
    ErrorData, ServerHandler,
};
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::Semaphore;

#[derive(Clone)]
pub(super) struct Handler {
    calls: async_channel::Sender<Call>,
    active: Arc<Semaphore>,
}

impl Handler {
    pub(super) fn new(calls: async_channel::Sender<Call>) -> Self {
        Self {
            calls,
            active: Arc::new(Semaphore::new(crate::external_mcp::constants::MAX_ACTIVE)),
        }
    }

    async fn dispatch(
        &self,
        principal: Principal,
        tool: &'static str,
        arguments: Value,
    ) -> Result<Value, String> {
        let _permit = self
            .active
            .clone()
            .try_acquire_owned()
            .map_err(|_| "MOLFAR is busy with other external calls; retry shortly.")?;
        let (reply, result) = tokio::sync::oneshot::channel();
        self.calls
            .try_send(Call {
                principal,
                tool,
                arguments,
                reply,
            })
            .map_err(|_| "MOLFAR is busy or unavailable; retry shortly.")?;

        match tokio::time::timeout(DISPATCH_DEADLINE, result).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err("MOLFAR closed before answering; read the target to check its state.".into()),
            Err(_) => Err("Timed out waiting for MOLFAR. Accepted work continues; retry with the same requestId.".into()),
        }
    }
}

impl ServerHandler for Handler {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("molfar", env!("CARGO_PKG_VERSION")))
            .with_instructions("MOLFAR runs the work: models, runtime approvals and Board stages stay in the app. Retry uncertain mutations with the same requestId.")
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, ErrorData> {
        let tools = tools::catalog()
            .into_iter()
            .map(|tool| {
                let schema = match tool.schema {
                    Value::Object(schema) => schema,
                    _ => Default::default(),
                };
                Tool::new(tool.name, tool.description, Arc::new(schema))
            })
            .collect();
        Ok(ListToolsResult::with_all_items(tools))
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, ErrorData> {
        let principal = context
            .extensions
            .get::<http::request::Parts>()
            .and_then(|parts| parts.extensions.get::<Principal>())
            .cloned()
            .ok_or_else(|| ErrorData::invalid_request("Unauthenticated request", None))?;
        let arguments = Value::Object(request.arguments.unwrap_or_default());
        let tool = tools::validate(&request.name, &arguments)
            .map_err(|error| ErrorData::invalid_params(error, None))?;
        if !principal.allows(tool.scope) {
            return Ok(failure(format!(
                "This client lacks the {} scope.",
                tool.scope.label()
            )));
        }

        Ok(match self.dispatch(principal, tool.name, arguments).await {
            Ok(value) => {
                CallToolResult::success(vec![ContentBlock::text(value.to_string())]).into()
            }
            Err(error) => failure(error),
        })
    }
}

fn failure(error: String) -> CallToolResponse {
    CallToolResult::error(vec![ContentBlock::text(error)]).into()
}
