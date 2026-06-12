import { access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const ACCOUNT_OPENING_IMPORT_EXAMPLE_COMMAND =
  'pnpm --filter @ambe/api account-opening:import-eml -- --file ./pilot-emails/sanitized-message.eml';

export type AccountOpeningEmlPathResolution = {
  providedPath: string;
  resolvedPath: string;
  currentWorkingDirectory: string;
  workspaceRoot: string | null;
  checkedPaths: string[];
};

export class AccountOpeningEmlPathError extends Error {
  constructor(readonly resolution: AccountOpeningEmlPathResolution) {
    super(
      [
        'Manual account-opening .eml import file was not found.',
        `Provided path: ${resolution.providedPath}`,
        `Resolved path: ${resolution.resolvedPath}`,
        `Current working directory: ${resolution.currentWorkingDirectory}`,
        'Example:',
        `  ${ACCOUNT_OPENING_IMPORT_EXAMPLE_COMMAND}`,
      ].join('\n'),
    );
    this.name = 'AccountOpeningEmlPathError';
  }
}

function isAbsolutePath(filePath: string): boolean {
  return (
    path.isAbsolute(filePath) ||
    path.win32.isAbsolute(filePath) ||
    path.posix.isAbsolute(filePath)
  );
}

export function findWorkspaceRoot(startDirectory: string): string | null {
  for (
    let current = path.resolve(startDirectory);
    ;
    current = path.dirname(current)
  ) {
    if (existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
      return current;
    }

    const parent = path.dirname(current);

    if (parent === current) {
      return null;
    }
  }
}

export function resolveAccountOpeningEmlPath(input: {
  providedPath: string;
  cwd?: string;
  workspaceRoot?: string | null;
  pathExists?: (filePath: string) => boolean;
}): AccountOpeningEmlPathResolution {
  const providedPath = input.providedPath.trim();
  const currentWorkingDirectory = path.resolve(input.cwd ?? process.cwd());
  const pathExists = input.pathExists ?? existsSync;
  const workspaceRoot =
    input.workspaceRoot === undefined
      ? findWorkspaceRoot(currentWorkingDirectory)
      : input.workspaceRoot;

  if (isAbsolutePath(providedPath)) {
    return {
      providedPath,
      resolvedPath: providedPath,
      currentWorkingDirectory,
      workspaceRoot,
      checkedPaths: [providedPath],
    };
  }

  const cwdPath = path.resolve(currentWorkingDirectory, providedPath);
  const repoPath = workspaceRoot
    ? path.resolve(workspaceRoot, providedPath)
    : cwdPath;
  const checkedPaths = repoPath === cwdPath ? [cwdPath] : [cwdPath, repoPath];
  const resolvedPath = pathExists(cwdPath) ? cwdPath : repoPath;

  return {
    providedPath,
    resolvedPath,
    currentWorkingDirectory,
    workspaceRoot,
    checkedPaths,
  };
}

export async function resolveExistingAccountOpeningEmlPath(input: {
  providedPath: string;
  cwd?: string;
  workspaceRoot?: string | null;
}): Promise<AccountOpeningEmlPathResolution> {
  const resolution = resolveAccountOpeningEmlPath(input);

  try {
    await access(resolution.resolvedPath);
    return resolution;
  } catch {
    throw new AccountOpeningEmlPathError(resolution);
  }
}
