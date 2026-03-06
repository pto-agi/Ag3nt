---
description: Move an exercise to a specific position within a Trainerize workout
---
# Reorder Exercise

## Usage
```bash
npx tsx src/index.ts reorder-exercise -c <email> -e "<exercise name>" -p <position> [-d] [-y]
```

## Flags
| Flag | Description |
|------|-------------|
| `-c, --client <email>` | Client email (required) |
| `-e, --exercise <name>` | Exercise name to move (required) |
| `-p, --position <number>` | Target position, 1-based (required) |
| `-d, --dry-run` | Preview only, no changes saved |
| `-y, --yes` | Auto-approve without prompting |

## Pipeline Steps
1. Login to Trainerize
2. Find client by email
3. Navigate to training program
4. Find which workout contains the exercise
5. Present diff for approval
6. Open Workout Builder
7. Drag-and-drop exercise to target position
8. Save workout

## Example
// turbo-all
```bash
npx tsx src/index.ts reorder-exercise -c ekonomi@ptogroup.se -e "Barbell Bench Press" -p 1 -y
```
