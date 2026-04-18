```markdown
# JYRY-AI Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill introduces the core development patterns and conventions used in the JYRY-AI TypeScript codebase. It covers file naming, import/export styles, commit message habits, and testing approaches, providing practical examples and step-by-step workflows to help contributors maintain consistency and quality.

## Coding Conventions

### File Naming
- **Style:** camelCase
- **Example:**  
  ```plaintext
  userProfile.ts
  dataProcessor.test.ts
  ```

### Import Style
- **Style:** Mixed (both default and named imports are used)
- **Examples:**
  ```typescript
  import fs from 'fs'; // Default import
  import { processData } from './dataProcessor'; // Named import
  ```

### Export Style
- **Style:** Named exports preferred
- **Example:**
  ```typescript
  // In dataProcessor.ts
  export function processData(input: string): string { ... }
  export const DATA_VERSION = '1.0.0';
  ```

### Commit Messages
- **Type:** Freeform, no strict prefixes
- **Average Length:** ~31 characters
- **Example:**
  ```
  add user authentication logic
  fix bug in data processor
  ```

## Workflows

### Adding a New Feature
**Trigger:** When implementing a new functionality  
**Command:** `/add-feature`

1. Create a new file using camelCase naming (e.g., `newFeature.ts`).
2. Write your feature using TypeScript, following the import/export conventions.
3. Add or update relevant test files (`newFeature.test.ts`).
4. Commit changes with a clear, concise message (no strict prefix required).
5. Open a pull request for review.

### Fixing a Bug
**Trigger:** When resolving a bug or issue  
**Command:** `/fix-bug`

1. Locate the problematic code.
2. Apply the fix, maintaining code style conventions.
3. Update or add tests in the corresponding `.test.ts` file.
4. Commit with a descriptive message (e.g., `fix error in data parsing`).
5. Submit your changes for review.

### Writing Tests
**Trigger:** When adding or updating tests  
**Command:** `/write-test`

1. Create or update a test file using the pattern `*.test.ts` (e.g., `userProfile.test.ts`).
2. Write tests using the project's preferred testing framework (unknown; check existing tests for style).
3. Ensure tests cover new or changed functionality.
4. Run tests locally before committing.

## Testing Patterns

- **File Pattern:** Test files are named with the `.test.ts` suffix.
- **Framework:** Not explicitly detected; inspect existing test files for framework usage.
- **Example:**
  ```typescript
  // userProfile.test.ts
  import { getUserProfile } from './userProfile';

  describe('getUserProfile', () => {
    it('should return correct user data', () => {
      const result = getUserProfile('user123');
      expect(result.name).toBe('Alice');
    });
  });
  ```

## Commands
| Command      | Purpose                                 |
|--------------|-----------------------------------------|
| /add-feature | Start the workflow for adding a feature |
| /fix-bug     | Start the workflow for fixing a bug     |
| /write-test  | Start the workflow for writing tests    |
```
