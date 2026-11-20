use super::*;
use molfar_core::secrets::{Error, SecretValue};

impl Input {
    pub(crate) fn secret_field(cx: &mut Context<Self>) -> Self {
        let mut input = Self::new(cx);
        input.set_secret(true);
        input.label = "Secret value".into();
        input.placeholder = "Enter secret value".into();
        input.max_height = 80.;
        input
    }

    pub(crate) fn secret_value(&self) -> Result<SecretValue, Error> {
        SecretValue::from_text(self.content.to_string())
    }

    pub(crate) fn valid_one_time_secret(&self) -> bool {
        SecretValue::valid_one_time(&self.content)
    }

    pub(crate) fn take_secret(&mut self, cx: &mut Context<Self>) -> Result<SecretValue, Error> {
        let value = SecretValue::one_time(self.content.to_string())?;
        self.clear_secret(cx);
        Ok(value)
    }

    pub(crate) fn clear_secret(&mut self, cx: &mut Context<Self>) {
        self.reset_editor_history();
        self.set_text(String::new(), cx);
    }
}
