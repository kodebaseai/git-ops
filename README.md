# @kodebase/git-ops

Git platform abstraction for GitHub, GitLab, and Bitbucket operations.

## Overview

`@kodebase/git-ops` provides a unified interface (`GitPlatformAdapter`) for interacting with different git platforms. This abstraction layer enables you to write platform-agnostic code for pull request operations, authentication, and branch management.

## Features

- **Platform Abstraction**: Single interface for GitHub, GitLab, and Bitbucket
- **PR Operations**: Create, update, merge, and query pull requests
- **Draft PR Support**: Create and manage draft pull requests
- **Auto-Merge**: Enable automatic merging when checks pass
- **Authentication**: Validate credentials and check permissions
- **Branch Management**: Query branch information and status
- **TypeScript-First**: Fully typed with comprehensive JSDoc documentation

## Installation

```bash
pnpm add @kodebase/git-ops
```

## Usage

```typescript
import type { GitPlatformAdapter } from '@kodebase/git-ops';

// Example: Using a GitHub adapter (implementation not included in this package)
const adapter: GitPlatformAdapter = new GitHubAdapter({
  token: process.env.GITHUB_TOKEN
});

// Validate authentication
const authStatus = await adapter.validateAuth();
if (!authStatus.authenticated) {
  throw new Error('Not authenticated');
}

// Create a draft PR
const pr = await adapter.createDraftPR({
  title: 'Feature: Add new component',
  body: 'This PR adds a new component',
  branch: 'feature/new-component',
  baseBranch: 'main',
  repoPath: '/path/to/repo'
});

// Enable auto-merge
await adapter.enableAutoMerge(pr.number, {
  mergeMethod: 'squash',
  deleteBranch: true
});
```

## Platform Compatibility

### GitHub
- ✅ Full support for all methods
- ✅ Native draft PR support
- ✅ Native auto-merge support
- ✅ Rich API for branch protection and reviews

### GitLab
- ✅ Full support for all methods
- ✅ Draft PRs (Merge Requests with WIP/Draft status)
- ✅ Auto-merge ("Merge when pipeline succeeds")
- ✅ Similar feature parity with GitHub

### Bitbucket
- ✅ Core PR operations supported
- ⚠️ Draft PRs may be simulated via labels or title prefixes
- ⚠️ Auto-merge may not be natively supported
- ⚠️ Some metadata fields may have limited availability

## API Reference

### GitPlatformAdapter Interface

The main interface with the following methods:

#### PR Operations
- `createPR(options)` - Create a regular pull request
- `createDraftPR(options)` - Create a draft pull request
- `getPR(prIdentifier)` - Get PR information
- `mergePR(prNumber, options)` - Merge a pull request
- `enableAutoMerge(prNumber, options)` - Enable auto-merge

#### Authentication
- `validateAuth()` - Validate authentication credentials

#### Branch Operations
- `getBranch(branchName, repoPath)` - Get branch information
- `getCurrentBranch(repoPath)` - Get current branch name
- `getRemoteUrl(repoPath, remoteName?)` - Get remote URL

#### Platform Status
- `isAvailable()` - Check if platform is accessible

### Types

See the [type definitions](./src/types/adapter.ts) for detailed information about:
- `PRCreateOptions`
- `PRInfo`
- `Branch`
- `AuthStatus`
- `TGitPlatform`
- `TMergeMethod`
- `TReviewStatus`

## License

MIT
