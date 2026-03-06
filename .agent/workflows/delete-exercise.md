---
description: Delete an exercise from a workout for a Trainerize client
---
# Delete Exercise

## Usage
```bash
npx tsx src/index.ts delete-exercise -c <email> -e "<exercise name>" [-d] [-y]
```

## Flags
| Flag | Description |
|------|-------------|
| `-c, --client <email>` | Client email (required) |
| `-e, --exercise <name>` | Exercise name to delete (required) |
| `-d, --dry-run` | Preview only, no changes saved |
| `-y, --yes` | Auto-approve without prompting |

## Pipeline Steps
1. Login to Trainerize
2. Find client by email
3. Navigate to training program
4. Find which workout contains the exercise
5. Present diff for approval
6. Open Workout Builder → check exercise checkbox → click delete
7. Verify exercise count decreased
8. Save workout

## Example
// turbo-all
```bash
npx tsx src/index.ts delete-exercise -c ekonomi@ptogroup.se -e "Barbell Bench Press" -y
```
