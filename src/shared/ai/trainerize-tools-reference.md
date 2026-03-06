# Trainerize API — Verktygsreferens för AI-agent

> **Syfte:** Denna fil ger AI-agenten fullständig förståelse för ALLA tillgängliga Trainerize API-verktyg.
> Använd den för att välja rätt verktyg beroende på situation, kontext och klientbehov.
> Alla funktioner importeras från `../integrations/trainerize-api.ts`.

---

## Snabbguide: Välj rätt verktyg

| Situation | Verktyg |
|---|---|
| Skapa ny klient | `addUser` |
| Hitta klient (sök) | `findUser` |
| Visa alla aktiva klienter | `getClientList` |
| Se klientprofil | `getUserProfile` |
| Se klientsammanfattning (stats + compliance) | `getClientSummary` |
| Ändra klientinfo | `setUserProfile` |
| Aktivera/avaktivera klient | `setUserStatus` |
| Byta tränare | `switchTrainer` |
| Skapa träningsplan | `addTrainingPlan` |
| Lägga till pass i plan | `addWorkoutDef` |
| Redigera befintligt pass | `setWorkoutDef` |
| Schemalägga pass på datum | `scheduleDailyWorkout` |
| Se klientens kalender | `getCalendarList` |
| Lägga till tränarnote | `addTrainerNote` |
| Skicka meddelande till klient | `sendMessage` |
| Svara i konversation | `replyToMessage` |
| Sätta mål | `addGoal` |
| Hantera vanor (habits) | `addHabit` |
| Se kroppsmått | `getBodyStats` |
| Skapa kostplan | `generateMealPlan` |
| Boka tid | `addAppointment` |

---

## 1. KLIENTHANTERING (User)

**När:** Skapa, hitta, uppdatera eller hantera klienter och tränare.

### Hitta och lista

| Funktion | Syfte | Nyckelparams |
|---|---|---|
| `findUser(searchTerm, options?)` | Sök klient/tränare via namn eller e-post | `view` (activeClient, trainer, etc), `sort`, `count` |
| `getClientList(options?)` | Lista alla klienter (med filter) | `view` (allActive, pendingClient, etc), `sort`, `verbose` |
| `getUserProfile(userIds[], unitBodystats?)` | Hämta profil för en eller flera användare | Stöder `'cm'` / `'inches'` |
| `getClientSummary(userId, unitWeight?)` | Snabb sammanfattning — stats, compliance, mål | Perfect för dashboard-vy |
| `getTrainerList(options?)` | Lista tränare i organisationen | `locationID`, `sort`, `start`, `count` |
| `getUserSettings(userId)` | Hämta användarinställningar | — |

### Skapa och ändra

| Funktion | Syfte | Nyckelparams |
|---|---|---|
| `addUser(options)` | Skapa ny klient eller tränare | `user` (objekt med email, namn, etc), `program`, `userGroupID`, `sendMail` |
| `deleteUser(options)` | Ta bort användare permanent | `transferContentToUser`, `transferClientToUser` |
| `setUserProfile(options)` | Uppdatera profil (namn, e-post, etc) | `unitBodystats`, `user` (objekt) |
| `setUserStatus(options)` | Aktivera, avaktivera eller sätt pending | `accountStatus`, `enableSignin`, `enableMessage` |
| `setPrivilege(options)` | Ändra roll/behörighet | `role` (trainer, sharedTrainer, manager, admin) |
| `switchTrainer(options)` | Flytta klient till annan tränare | `userID`, `trainerID` eller `email` |
| `setUserTags(userId, userTags[])` | Sätt alla taggar på en gång | Överskriver befintliga taggar |

### Åtkomst och inloggning

| Funktion | Syfte | Nyckelparams |
|---|---|---|
| `getSetupLink(userId)` | Hämta setup-länk för nytt konto | — |
| `getLoginToken(options)` | Engångs-/flervägs inloggningstoken | `duration` (sek, max 12h), `able` (återanvändbar?) |

> **Beslutslogik:** Använd `findUser` för att söka, `getClientList` för att lista med filter, `getClientSummary` för snabb överblick, `getUserProfile` för detaljerad profil.

---

## 2. TRÄNINGSPROGRAM (Program)

**När:** Hantera masterprogram — tilldela klienter, kopiera, flytta, lista.

| Funktion | Syfte | Nyckelparams |
|---|---|---|
| `getProgramList(options?)` | Lista alla masterprogram | `type` (all, shared, mine, other), `tag`, `includeHQ` |
| `getProgram(programId)` | Hämta ett programs detaljer | — |
| `getUserProgramList(userId)` | Se vilka program en klient är tilldelad | — |
| `getProgramUserList(options)` | Se vilka klienter som är i ett program | `sort`, `start`, `count` |
| `getProgramCalendarList(options)` | Se programs kalendervy | `startDay`, `endDay` |
| `getProgramTrainingPlanList(programId)` | Lista träningsplaner i ett program | — |
| `addUserToProgram(options)` | Tilldela klient till program | `subscribeType` ('core' / 'addon') |
| `removeUserFromProgram(programId, userId)` | Ta bort klient från program | — |
| `copyProgramToUser(options)` | Kopiera program till klient | `forceMerge` |
| `copyTrainingPlanToClient(options)` | Kopiera specifik plan till klient | `trainingPlanID`, `forceMerge` |
| `moveProgram(options)` | Flytta program mellan shared/mine/other | `forceType` |
| `setUserProgram(options)` | Ändra klientens programinställningar | `subscribeType` (byta addon→core) |

> **Beslutslogik:** `addUserToProgram` = tilldela befintligt program. `copyProgramToUser` = skapa kopia (anpassningsbart). `copyTrainingPlanToClient` = kopiera specifik plan, inte hela programmet.

---

## 3. TRÄNINGSPLANER (Training Plan)

**När:** Skapa, lista eller ta bort träningsplaner. En plan innehåller workout-definitioner.

| Funktion | Syfte | Nyckelparams |
|---|---|---|
| `getTrainingPlanList(userId)` | Lista klientens träningsplaner | — |
| `addTrainingPlan(userId, plan)` | Skapa ny plan | `name`, `instruction`, `startDate`, `duration`, `durationType` |
| `deleteTrainingPlan(planId, closeGap?)` | Ta bort plan (och dess schemalagda pass) | `closeGap` (1 = stäng lucka i schema) |

> **Flöde:** `addTrainingPlan` → `addWorkoutDef` (typ: trainingPlan) → `scheduleDailyWorkout`

---

## 4. WORKOUT-DEFINITIONER (WorkoutDef)

**När:** Skapa, hämta eller redigera passmallar (workout definitions). Kärnan i all träning.

| Funktion | Syfte | Nyckelparams |
|---|---|---|
| `getWorkoutDef(ids[])` | Hämta 1-40 workout-definitioner | Max 40 stycken per anrop |
| `getWorkoutDefListForPlan(planId, options?)` | Lista alla workouts i en plan | `searchTerm`, `filter`, pagination |
| `addWorkoutDef(options)` | Skapa ny workout | `type` (trainingPlan/shared/mine/other), `workoutDef` med `exercises[]` |
| `setWorkoutDef(workoutDef)` | Uppdatera befintlig workout | `id` (required), `exercises[]`, `tags[]`, `trackingStats` |

### Workout types
- `workoutRegular` — standard styrkepass
- `workoutCircuit` — cirkelträning
- `workoutTimed` — tidsbaserat
- `workoutInterval` — intervallpass
- `workoutVideo` — videopass
- `cardio` — konditionspass

### Exercise def (i exercises[])
Varje övning har `def` med: `id`, `sets`, `target`, `targetDetail`, `restTime`, `side`, `supersetID`, `supersetType`, `intervalTime`, `recordType`.

**recordType-värden:** `general`, `strength`, `endurance`, `timedFasterBetter`, `timedLongerBetter`, `timedStrength`, `cardio`, `rest`

> **Beslutslogik:** Använd `addWorkoutDef` med `type: 'trainingPlan'` och `trainingPlanID` för att lägga i en plan. Använd `type: 'mine'` för privata mallar.

---

## 5. WORKOUT TEMPLATES

**När:** Söka och bläddra i workout-mallbiblioteket.

| Funktion | Syfte | Nyckelparams |
|---|---|---|
| `getWorkoutTemplateList(options?)` | Lista workout-mallar | `view`, `tags`, `sort`, `searchTerm`, pagination |

---

## 6. ÖVNINGAR (Exercise)

**När:** Hantera övningsdatabasen — hämta, skapa eller uppdatera enskilda övningar.

| Funktion | Syfte | Nyckelparams |
|---|---|---|
| `getExercise(exerciseId)` | Hämta en övnings detaljer | — |
| `setExercise(options)` | Uppdatera övning | `name`, `recordType`, `tag`, `videoUrl`, `videoType` |
| `addExercise(options)` | Skapa ny övning | `name` (required), `recordType`, `videoUrl`, `tags` |

> **OBS:** För att söka övningar efter namn, använd `searchExerciseByName()` från `exercise-cache.ts` (inte API:t direkt).

---

## 7. SCHEMA & KALENDER (Calendar + DailyWorkout)

**När:** Visa klienters schema, schemalägga pass, eller hämta detaljer om schemalagda pass.

| Funktion | Syfte | Nyckelparams |
|---|---|---|
| `getCalendarList(userId, startDate, endDate, options?)` | Visa klientens kalender | `unitDistance`, `unitWeight` |
| `getDailyWorkout(dailyWorkoutIds[])` | Hämta schemalagda pass-instanser | IDs kommer från kalenderitems |
| `scheduleDailyWorkout(options)` | Schemalägg workout(s) på specifika datum | `userID` (tränare!), `dailyWorkouts[]`, `unitWeight` |

> **VIKTIGT:** `scheduleDailyWorkout` kräver **tränare-ID** som `userID`, INTE klient-ID! Klient-ID:t specificeras i varje `dailyWorkout.clientID`.

---

## 8. MEDDELANDEN (Message)

**När:** Kommunicera med klienter — visa konversationer, skicka meddelanden, svara.

| Funktion | Syfte | Nyckelparams |
|---|---|---|
| `getMessageThreads(userId, options?)` | Lista konversationstrådar | `view` (inbox/byClient/archived), `clientID`, pagination |
| `getMessage(messageId)` | Hämta specifikt meddelande | — |
| `sendMessage(options)` | Skicka nytt meddelande (ny tråd) | `userID` (avsändare), `recipients[]`, `subject`, `body` |
| `replyToMessage(options)` | Svara i befintlig tråd | `threadID`, `body`, `type` |
| `sendMassMessage(options)` | Massutskick till flera | `recipients[]`, `body` |

> **Beslutslogik:** `sendMessage` = ny konversation. `replyToMessage` = svara i befintlig tråd. `sendMassMessage` = samma meddelande till många.

---

## 9. TRÄNARNOTES (Trainer Notes)

**När:** Dokumentera klientkontext — skador, preferenser, historik, workout-anteckningar. Fungerar som AI:ens "arbetsminne".

| Funktion | Syfte | Nyckelparams |
|---|---|---|
| `addTrainerNote(options)` | Lägg till anteckning | `userID`, `content`, `type` (general/workout), `injury` |
| `getTrainerNotes(clientId, options?)` | Lista alla anteckningar för klient | `filterType` (general/pinned/workout), `searchTerm` |
| `getTrainerNote(options)` | Hämta specifik note (kopplad till workout) | `type: 'workout'`, `attachTo` (dailyWorkoutID) |
| `setTrainerNote(options)` | Uppdatera befintlig note | `id`, `content`, `injury` |
| `deleteTrainerNote(noteId)` | Ta bort note | — |

> **AI-strategi:** Läs ALLTID `getTrainerNotes` innan du agerar på en klient! Notes innehåller skador, mål och preferenser. Skriv note (`addTrainerNote`) efter varje signifikant åtgärd för att bygga klienthistorik.

---

## 10. MÅL (Goals)

**När:** Sätta, spåra eller hantera klientmål.

| Funktion | Syfte | Nyckelparams |
|---|---|---|
| `getGoals(userId, options?)` | Lista klientens mål | `achieved`, `unitWeight`, pagination |
| `getGoal(options)` | Hämta specifikt mål | `id`, `achieved` |
| `addGoal(options)` | Skapa nytt mål | `type` (textGoal/weightGoal/nutritionGoal), `text` |
| `setGoal(options)` | Uppdatera mål | — |
| `deleteGoal(goalId)` | Ta bort mål | — |
| `setGoalProgress(goalId, progress)` | Uppdatera framsteg (0-100) | — |

---

## 11. KROPPSMÅTT (Body Stats)

**När:** Registrera, läsa eller redigera klienters kroppsmått.

| Funktion | Syfte | Nyckelparams |
|---|---|---|
| `getBodyStats(userId, options?)` | Hämta kroppsmått | `date` ('last' för senaste), `unitBodystats`, `unitWeight` |
| `addBodyStat(userId, options)` | Registrera nytt mätvärde | `date`, `status` |
| `setBodyStats(userId, options)` | Uppdatera kroppsmått | `bodyMeasures`, `unitWeight`, `unitBodystats` |
| `deleteBodyStat(options)` | Ta bort mätning | `id` eller `userID` + `date` |

---

## 12. KOST & NUTRITION (Meal Plan + Custom Food + Meal Template + Daily Nutrition)

**När:** Hantera kostplaner, livsmedel, måltidsmallar eller daglig näring.

### Kostplan

| Funktion | Syfte | Nyckelparams |
|---|---|---|
| `getMealPlan(options)` | Hämta kostplan | `id` eller `userid` (lowercase!) |
| `setMealPlan(userId, mealPlan)` | Uppdatera kostplan | — |
| `deleteMealPlan(userId)` | Ta bort kostplan | — |
| `generateMealPlan(options)` | AI-generera kostplan | `caloriesTarget`, `macroSplit`, `mealsPerDay`, `excludes[]` |

### Livsmedel

| Funktion | Syfte | Nyckelparams |
|---|---|---|
| `getCustomFoodList(options?)` | Lista egna livsmedel | `searchTerm`, `sort`, pagination |
| `addCustomFood(options)` | Skapa eget livsmedel | `name`, `barcode`, `serving[]` |
| `setCustomFood(options)` | Uppdatera livsmedel | `foodId` |
| `deleteCustomFood(options)` | Ta bort livsmedel | `foodId` |

### Måltidsmallar

| Funktion | Syfte | Nyckelparams |
|---|---|---|
| `getMealTemplateList(options?)` | Lista måltidsmallar | `searchTerm`, `filters`, pagination |
| `getMealTemplate(mealTemplateId, multiplier?)` | Hämta specifik mall | `multiplier` för portionsjustering |
| `addMealTemplate(options)` | Skapa måltidsmall | `mealName`, `mealTypes[]`, `macroSplit`, `tags[]` |
| `setMealTemplate(options)` | Uppdatera mall | — |
| `deleteMealTemplate(mealTemplateId)` | Ta bort mall | — |

### Daglig nutrition

| Funktion | Syfte | Nyckelparams |
|---|---|---|
| `getDailyNutritionList(options)` | Lista daglig nutrition (period) | `userID`, `startDate`, `endDate` |
| `getDailyNutrition(options)` | Hämta specifik dag | `userID`, `date` eller `id` |

---

## 13. VANOR (Habits)

**När:** Skapa, spåra eller hantera dagliga vanor.

| Funktion | Syfte | Nyckelparams |
|---|---|---|
| `addHabit(options)` | Skapa ny vana | `userID`, `type` (customHabit, eatProtein, etc), `startDate`, `duration` |
| `getHabitList(userId, options?)` | Lista vanor | `status` (current/upcoming/past), pagination |
| `getDailyHabit(userId, dailyItemID)` | Hämta daglig vana-instans | — |
| `setDailyHabit(userId, dailyItemID, status)` | Uppdatera status | — |
| `deleteDailyHabit(userId, dailyItemID)` | Ta bort daglig vana | — |

---

## 14. KONDITION (Daily Cardio)

**När:** Logga eller hantera konditionspass.

| Funktion | Syfte | Nyckelparams |
|---|---|---|
| `addDailyCardio(options)` | Registrera konditionspass | `exerciseID`, `date`, `target`, `unitDistance` |
| `getDailyCardio(options)` | Hämta konditionspass | `id` |
| `setDailyCardio(options)` | Uppdatera pass (tid, distans, HR, etc) | Många fält: `distance`, `time`, `calories`, `avgHeartRate` etc |

---

## 15. HÄLSODATA (Health Data)

**När:** Hämta hälsodata från wearables (Garmin, Fitbit, etc).

| Funktion | Syfte | Nyckelparams |
|---|---|---|
| `getHealthDataList(options)` | Hämta hälsodata (steg, HR, sömn, etc) | `type` (step/restingHeartRate/sleep/bloodPressure/calorieOut) |
| `getHealthDataSleep(options)` | Hämta sömndata specifikt | `startTime`, `endDate` |

---

## 16. FOTON (Photos)

**När:** Ladda upp eller visa progress-foton.

| Funktion | Syfte | Nyckelparams |
|---|---|---|
| `getPhotoList(userId, startDate, endDate)` | Lista progress-foton (period) | — |
| `getPhotoByID(options)` | Hämta specifikt foto | `thumbnail` för preview |
| `addPhoto(file, data)` | Ladda upp foto (multipart/form-data) | `userID`, `date`, `type` |

---

## 17. COMPLIANCE

**När:** Mäta klienters följsamhet till programmet.

| Funktion | Syfte | Nyckelparams |
|---|---|---|
| `getUserCompliance(userId, startDate, endDate)` | Compliance-data för en klient | — |
| `getGroupCompliance(groupId, startDate, endDate)` | Compliance-data för en grupp | — |

> **AI-strategi:** Använd compliance-data för att identifiera klienter som tappar motivation. Kombinera med `addTrainerNote` och `sendMessage` för proaktiv coaching.

---

## 18. CHALLENGES

**När:** Hantera utmaningar och deltagare.

| Funktion | Syfte | Nyckelparams |
|---|---|---|
| `getChallengeList(view?)` | Lista utmaningar | `'mine'` / `'all'` |
| `getChallengeLeaderboardParticipants(options)` | Se topplista | `challengeID`, `searchTerm`, `reversed` |
| `getChallengeThresholdParticipants(options)` | Se deltagare per nivå | `level` (level0-level4) |
| `addChallengeParticipants(challengeID, userIDs[])` | Lägg till deltagare | — |
| `removeChallengeParticipants(challengeID, userIDs[])` | Ta bort deltagare | — |

---

## 19. TAGGAR & GRUPPER (User Tags + User Groups)

**När:** Organisera klienter med taggar och grupper.

### Taggar (global hantering)

| Funktion | Syfte |
|---|---|
| `createTag(name)` | Skapa ny tagg |
| `deleteTag(name)` | Ta bort tagg |
| `getTagList()` | Lista alla taggar |
| `renameTag(oldName, newName)` | Byt namn på tagg |
| `addTagToUser(userId, userTag)` | Lägg till tagg på klient |
| `deleteTagFromUser(userId, userTag)` | Ta bort tagg från klient |

### Grupper

| Funktion | Syfte | Nyckelparams |
|---|---|---|
| `addUserGroup(options)` | Skapa grupp | `name`, `type` (trainingGroup, fitnessCommunity, etc) |
| `addUserToGroup(options)` | Lägg till klient i grupp | `id` (gruppID), `email`/`userID` |
| `deleteUserFromGroup(groupId, userId)` | Ta bort klient från grupp | — |
| `deleteUserGroup(groupId)` | Ta bort grupp | — |
| `getUserGroup(groupId)` | Hämta gruppdetaljer | — |
| `getGroupList(options?)` | Lista grupper | `view` (all/mine), pagination |
| `getGroupAddons(groupId)` | Se gruppens addons | — |
| `getGroupUserList(groupId)` | Lista klienter i grupp | — |
| `setUserGroup(options)` | Uppdatera gruppinfo | `name`, `icon` |
| `setGroupAddons(options)` | Ändra gruppaddons | `addOns` |

---

## 20. BOKNINGAR (Appointments)

**När:** Boka, visa eller hantera träningstider.

| Funktion | Syfte | Nyckelparams |
|---|---|---|
| `addAppointment(options)` | Boka ny tid | `appointmentTypeID`, `startDate`, `endDate`, `notes`, `actionInfo` (recurring) |
| `getAppointmentTypes(options?)` | Lista tillgängliga typer | `filter` (ignoreDeleted, ignoreVideoCall, ignoreExternal) |
| `getAppointmentType(appointmentTypeId)` | Hämta en typ | — |
| `getAppointments(userId, startDate, endDate)` | Se bokningar (period) | — |

---

## 21. ÖVRIGA

| Funktion | Syfte | Nyckelparams |
|---|---|---|
| `getAccomplishments(userId, options?)` | Lista klientens milstolpar | pagination |
| `getAccomplishmentStats(userId, options?)` | Stats per kategori | `category` (goalHabit, workoutBrokenRecord, etc) |
| `getLocationList(groupID?)` | Lista platser/locations | — |
| `getUnreadNotificationCount(userId)` | Olästa notiser | — |
| `uploadFile(file, data)` | Ladda upp fil (multipart) | — |
| `apiCall(endpoint, body?)` | Rå API-anrop (för okopplade endpoints) | — |

---

## Vanliga arbetsflöden

### 🏋️ Skapa komplett träningsprogram

```
1. findUser(email)                          → Hitta klient
2. getTrainerNotes(clientId)                → Läs kontext (skador, mål)
3. addTrainingPlan(clientId, plan)           → Skapa plan
4. addWorkoutDef({ type: 'trainingPlan' })  → Skapa pass (×N)
5. scheduleDailyWorkout({ userID: trainerID }) → Schemalägg
6. addTrainerNote({ userID: clientId })     → Dokumentera
7. sendMessage({ userID: trainerID })       → Informera klient
```

### 💬 Hantera klientkommunikation

```
1. getMessageThreads(trainerID, { view: 'inbox' })
2. getMessage(messageId)                    → Läs meddelande
3. getTrainerNotes(clientId)                → Läs kontext
4. replyToMessage({ threadID, body })       → Svara
```

### 📊 Veckouppföljning av klient

```
1. getUserCompliance(clientId, startDate, endDate)
2. getCalendarList(clientId, startDate, endDate)
3. getBodyStats(clientId, { date: 'last' })
4. getAccomplishments(clientId)
5. getHealthDataList({ type: 'step', ... })
6. getTrainerNotes(clientId)                → Kontext
7. addTrainerNote(...)                      → Dokumentera uppföljning
```

### 🍎 Kostplanering

```
1. getUserProfile([clientId])               → Allergier, preferenser
2. getTrainerNotes(clientId)                → Kost-kontext
3. generateMealPlan({                       → AI-generera
     caloriesTarget, macroSplit, excludes
   })
4. addTrainerNote(...)                      → Dokumentera
```

### 👤 Onboarding ny klient

```
1. addUser({ user: {...}, program, sendMail: true })
2. addTagToUser(userId, 'Ny klient')
3. addUserToGroup({ id: groupId, userID })
4. addGoal({ userID, type: 'textGoal', text })
5. addTrainingPlan(...)
6. addWorkoutDef(...) × N
7. scheduleDailyWorkout(...)
8. addTrainerNote({ content: summary })
9. sendMessage({ body: 'Välkommen!' })
```

---

## Kritiska regler

1. **Läs ALLTID `getTrainerNotes` innan du agerar** — det är AI:ens arbetsminne
2. **Skriv ALLTID `addTrainerNote` efter signifikanta åtgärder** — bygg historik
3. **`scheduleDailyWorkout` kräver tränare-ID**, inte klient-ID
4. **`getMealPlan` använder lowercase `userid`** — API-egenhet
5. **`setWorkoutDef` kräver `id`** — du kan inte skapa med set, använd `addWorkoutDef`
6. **Max 40 workouts per `getWorkoutDef`-anrop**
7. **`uploadFile` och `addPhoto` kräver multipart/form-data**, inte JSON
