import { applyFileMentionsToTurn } from "../../files/model/file-mentions";
import { applyConfluenceToTurn } from "../../inbox/model/confluence/prompt";
import { applyNotesToTurn } from "../../notes";
import {
  applySkillsToTurn,
  warmNativeSkills,
  isNativeCommandPrompt,
  type SkillCatalogContext,
} from "../../skills/model/skills";
import { nativeCommandPrompt } from "../../../integrations/harness/core/native-commands";

export async function preparePrompt(
  text: string,
  context: SkillCatalogContext,
): Promise<string> {
  warmNativeSkills(context);

  if (isNativeCommandPrompt(text, context.harness)) {
    return nativeCommandPrompt(context.harness, text);
  }

  const withFiles = await applyFileMentionsToTurn(text, context.cwd);
  const withNotes = await applyNotesToTurn(withFiles);
  const withConfluence = await applyConfluenceToTurn(withNotes);

  return applySkillsToTurn(withConfluence, context);
}
