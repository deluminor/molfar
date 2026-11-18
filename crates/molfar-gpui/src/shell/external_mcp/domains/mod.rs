mod automations;
mod familiars;
mod knowledge;

use super::*;

fn generated_id(principal: &Principal, request: &str) -> String {
    let identity = json!([principal.client_id, request]).to_string();
    molfar_core::familiar::files::content_hash(&identity)
}

impl Shell {
    pub(super) fn external_domain_target(
        &mut self,
        scope: &Scope,
        definition: &tools::Tool,
        arguments: &Value,
        cx: &mut Context<Self>,
    ) -> Result<Option<ReceiptTarget>, String> {
        match definition.target {
            tools::TargetKind::Vault => {
                self.ensure_vault(cx);
                self.external_vault_target(scope, cx).map(Some)
            }
            tools::TargetKind::Project if definition.name.starts_with("automations_") => {
                self.external_automation_target(scope, definition.name, arguments)
            }
            tools::TargetKind::Familiar | tools::TargetKind::None
                if definition.name.starts_with("familiars_") =>
            {
                self.external_familiar_target(scope, definition.name, arguments, cx)
            }
            _ => Ok(None),
        }
    }
}
