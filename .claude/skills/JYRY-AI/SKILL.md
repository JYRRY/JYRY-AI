```markdown
# JYRY-AI Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and conventions used in the JYRY-AI TypeScript codebase. You'll learn about file naming, import/export styles, commit message tendencies, and how to structure and run tests. This guide is ideal for onboarding new contributors or standardizing team practices.

## Coding Conventions

### File Naming
- Use **camelCase** for all file names.
  - Example: `userProfile.ts`, `dataFetcher.ts`

### Import Style
- Use **relative imports** for referencing modules within the codebase.
  - Example:
    ```typescript
    import { fetchData } from './dataFetcher';
    ```

### Export Style
- Use **named exports** exclusively.
  - Example:
    ```typescript
    // In userProfile.ts
    export function getUserProfile(id: string) { ... }
    ```

### Commit Messages
- Freeform style, no enforced prefixes.
- Average commit message length: ~43 characters.
  - Example: `fix bug in dataFetcher for null values`

## Workflows

### Adding a New Module
**Trigger:** When you need to add a new feature or utility.
**Command:** `/add-module`

1. Create a new file using camelCase (e.g., `myNewFeature.ts`).
2. Use named exports for all functions or constants.
3. Use relative imports to include dependencies.
4. Write corresponding tests in a `.test.ts` file.

### Refactoring Existing Code
**Trigger:** When improving or restructuring code.
**Command:** `/refactor`

1. Identify the target file(s).
2. Maintain camelCase naming for any new or renamed files.
3. Update imports to remain relative.
4. Ensure all exports remain named.
5. Update or add tests as needed.

### Writing Tests
**Trigger:** When adding or updating features.
**Command:** `/write-test`

1. Create a test file with the pattern `*.test.ts` (e.g., `userProfile.test.ts`).
2. Place test files alongside the modules they test or in a dedicated test folder.
3. Follow the same import/export conventions as production code.

## Testing Patterns

- Test files follow the `*.test.ts` naming pattern.
- The testing framework is not specified; use standard TypeScript testing practices.
- Example test file:
  ```typescript
  import { getUserProfile } from './userProfile';

  test('should fetch user profile by ID', () => {
    const profile = getUserProfile('123');
    expect(profile.id).toBe('123');
  });
  ```

## Commands
| Command        | Purpose                                 |
|----------------|-----------------------------------------|
| /add-module    | Scaffold a new module with conventions  |
| /refactor      | Guide for safely refactoring code       |
| /write-test    | Steps for writing and placing tests     |
```
