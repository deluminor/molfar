package expo.modules.molfarlink

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MolfarLinkModule : Module() {
  companion object { init { System.loadLibrary("molfar_mobile_link") } }
  private external fun nativeCall(input: String): String
  override fun definition() = ModuleDefinition {
    Name("MolfarLink")
    AsyncFunction("execute") { input: String -> nativeCall(input) }
  }
}
