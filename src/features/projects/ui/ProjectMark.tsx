import type { ReactNode } from "react";
import { projectKey, projectName } from "../../../shared/lib/paths";
import {
  loadTabGroupColors,
  loadTabGroupCustomColors,
  loadTabGroupMascots,
  resolveTabGroupColor,
  resolveTabGroupLogo,
  resolveTabGroupMascot,
} from "../../workspace/model/tabGroups";
import { useTabGroupLogos } from "../hooks/useTabGroupLogos";
import { ProjectLogoIcon } from "./ProjectLogoIcon";
import { ProjectMascot } from "./ProjectMascot";

type Props = {
  path: string;
  /** Size of an uploaded logo; the pixel mascot reads best a step smaller. */
  logoClassName?: string;
  mascotClassName?: string;
};

/** A project's logo when it has one, otherwise its coloured rail mascot. */
export function ProjectMark({
  path,
  logoClassName = "size-3.5",
  mascotClassName = "size-3",
}: Props): ReactNode {
  const logos = useTabGroupLogos();
  const key = projectKey(path);
  const logoPath = resolveTabGroupLogo(key, logos);

  if (logoPath) {
    return (
      <ProjectLogoIcon
        path={logoPath}
        className={`${logoClassName} shrink-0 rounded-sm`}
        imageClassName={logoClassName}
      />
    );
  }

  return (
    <ProjectMascot
      project={projectName(path)}
      color={resolveTabGroupColor(key, loadTabGroupColors(), loadTabGroupCustomColors(), projectName(path))}
      name={resolveTabGroupMascot(key, loadTabGroupMascots())}
      className={`${mascotClassName} shrink-0`}
    />
  );
}
