/**
 * Direct Trainerize API Client
 * 
 * Uses the official Trainerize REST API with Basic Auth.
 * Replaces browser automation (Playwright) and Zapier MCP for most operations.
 * 
 * Auth: Authorization: Basic [Base64(groupID:APIToken)]
 * Docs: https://developers.trainerize.com/
 */

import { createStepLogger } from '../logger.js';

const log = createStepLogger('trainerize-api');

// ── Config ──

const GROUP_ID = process.env.TRAINERIZE_GROUP_ID || '11613';
const API_TOKEN = process.env.TRAINERIZE_API_TOKEN || '0nC1ptkUms0NGJJIWw';
const BASE_URL = 'https://api.trainerize.com/v03';

function getAuthHeader(): string {
    const credentials = `${GROUP_ID}:${API_TOKEN}`;
    const encoded = Buffer.from(credentials).toString('base64');
    return `Basic ${encoded}`;
}

// ── Core request helper ──

interface ApiResponse<T = any> {
    ok: boolean;
    data?: T;
    error?: string;
    status?: number;
    raw?: any;
}

async function apiCall<T = any>(
    endpoint: string,
    body?: Record<string, unknown>,
): Promise<ApiResponse<T>> {
    const url = `${BASE_URL}${endpoint}`;

    log.info({ endpoint, bodyKeys: body ? Object.keys(body) : [] }, 'API call');

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': getAuthHeader(),
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        const text = await res.text();
        let data: any;

        try {
            data = JSON.parse(text);
        } catch {
            data = { rawText: text };
        }

        if (!res.ok) {
            log.error({ endpoint, status: res.status, data }, 'API error');
            return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}`, status: res.status, raw: data };
        }

        log.info({ endpoint, status: res.status }, 'API call succeeded');
        return { ok: true, data, status: res.status, raw: data };
    } catch (err: any) {
        log.error({ endpoint, error: err.message }, 'API call failed');
        return { ok: false, error: err.message };
    }
}

// ── User endpoints ──

export async function findUser(searchTerm: string, options?: {
    view?: 'allClient' | 'activeClientPicker' | 'recipient';
    start?: number;
    count?: number;
}) {
    return apiCall('/user/find', {
        searchTerm,
        view: options?.view || 'allClient',
        start: options?.start || 0,
        count: options?.count || 25,
    });
}

export async function getUserProfile(userIds: number[]) {
    return apiCall('/user/getProfile', { usersid: userIds });
}

export async function getTrainerList() {
    return apiCall('/user/getTrainerList', {});
}

export async function getUserSettings(userId: number) {
    return apiCall('/user/getSettings', { userID: userId });
}

export async function getClientList(options?: {
    view?: 'allActive' | 'activeClient' | 'pendingClient' | 'deactivatedClient';
    start?: number;
    count?: number;
    sort?: 'name' | 'dateAdded' | 'lastSignedIn' | 'lastMessaged' | 'lastTrainingPlanEndDate';
    verbose?: boolean;
}) {
    return apiCall('/user/getClientList', {
        view: options?.view || 'allActive',
        start: options?.start || 0,
        count: options?.count || 25,
        ...(options?.sort ? { sort: options.sort } : {}),
        ...(options?.verbose !== undefined ? { verbose: options.verbose } : {}),
    });
}

export async function getClientSummary(userId: number) {
    return apiCall('/user/getClientSummary', { userID: userId });
}

export async function addUser(data: {
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
}) {
    return apiCall('/user/add', {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
    });
}

export async function setUserProfile(userId: string, data: Record<string, unknown>) {
    return apiCall('/user/setProfile', { userID: userId, ...data });
}

export async function setUserStatus(userId: string, status: 'active' | 'inactive') {
    return apiCall('/user/setStatus', { userID: userId, status });
}

// ── Program endpoints ──

export async function getUserProgramList(userId: string) {
    return apiCall('/program/getUserProgramList', { userID: userId });
}

export async function getProgramList(type: 'all' | 'shared' | 'mine' | 'other' = 'all') {
    return apiCall('/program/getList', { type });
}

export async function getProgram(programId: string) {
    return apiCall('/program/get', { programID: programId });
}

export async function addUserToProgram(userId: string, programId: string, startDate?: string) {
    return apiCall('/program/addUser', {
        userID: userId,
        programID: programId,
        startDate: startDate || new Date().toISOString().split('T')[0],
    });
}

export async function removeUserFromProgram(userId: string, programId: string) {
    return apiCall('/program/deleteUser', { userID: userId, programID: programId });
}

export async function copyProgramToUser(userId: string, programId: string, startDate?: string) {
    return apiCall('/program/copyToUser', {
        userID: userId,
        programID: programId,
        startDate: startDate || new Date().toISOString().split('T')[0],
    });
}

export async function setUserProgram(userId: string, programId: string, data: Record<string, unknown>) {
    return apiCall('/program/setUserProgram', { userID: userId, programID: programId, ...data });
}

// ── Training Plan endpoints ──

export async function getTrainingPlanList(userId: string) {
    return apiCall('/trainingPlan/getList', { userID: userId });
}

export async function getWorkoutDefListForPlan(trainingPlanId: string) {
    return apiCall('/trainingPlan/getWorkoutDefList', { trainingPlanID: trainingPlanId });
}

/**
 * Create a new training plan for a user.
 * @param userId Client ID (NOT trainer ID)
 * @param plan Plan details: name, instruction (description), startDate, duration, durationType, endDate
 */
export async function addTrainingPlan(userId: number, plan: {
    name: string;
    instruction?: string;
    startDate?: string;
    duration?: number;
    durationType?: 'week' | 'month' | 'specificDate' | 'notSpecified';
    endDate?: string;
}) {
    return apiCall('/trainingPlan/add', {
        userid: userId,  // NOTE: lowercase 'userid' — API requires this exact casing
        plan: { id: 0, ...plan },
    });
}

export async function deleteTrainingPlan(trainingPlanId: string) {
    return apiCall('/trainingPlan/delete', { trainingPlanID: trainingPlanId });
}

// ── Workout Definition endpoints ──
// WorkoutDef structure: { id, name, exercises: [{ def: { id, name, sets, target, restTime, recordType, supersetType, ... } }] }

export async function getWorkoutDef(workoutDefIds: number[]) {
    return apiCall('/workoutDef/get', { ids: workoutDefIds });
}

export async function setWorkoutDef(workoutDef: Record<string, unknown>) {
    return apiCall('/workoutDef/set', { workoutDef });
}

export async function addWorkoutDef(options: {
    type?: 'trainingPlan' | 'shared' | 'mine';
    trainingPlanID?: number;
    userID?: number;
    workoutDef: {
        name: string;
        type?: 'workoutRegular' | 'cardio' | 'workoutCircuit' | 'workoutTimed';
        instructions?: string;
        exercises: Array<{
            def: {
                id: number;
                sets: number;
                target: string;
                restTime: number;
                recordType?: string;
                supersetType?: string;
                superSetID?: number;
                side?: string | null;
            };
        }>;
    };
}) {
    return apiCall('/workoutDef/add', options);
}

// ── Exercise endpoints ──

export async function getExercise(exerciseId: number) {
    return apiCall('/exercise/get', { id: exerciseId });
}

export async function setExercise(exerciseId: string, data: Record<string, unknown>) {
    return apiCall('/exercise/set', { exerciseID: exerciseId, ...data });
}

export async function addExercise(data: Record<string, unknown>) {
    return apiCall('/exercise/add', data);
}

// ── Message endpoints ──

export async function getMessageThreads(userId: number, view: 'inbox' | 'byClient' | 'archived' = 'inbox') {
    return apiCall('/message/getThreads', { userID: userId, view });
}

export async function getMessage(threadId: number) {
    return apiCall('/message/get', { threadID: threadId });
}

export async function sendMessage(options: {
    senderID: number;
    recipients: number[];
    subject: string;
    body: string;
    threadType?: string;
    conversationType?: string;
}) {
    return apiCall('/message/send', {
        userID: options.senderID,
        recipients: options.recipients,
        subject: options.subject,
        body: options.body,
        threadType: options.threadType || 'mainThread',
        conversationType: options.conversationType || 'single',
        type: 'text',
    });
}

export async function replyToMessage(threadId: number, body: string) {
    return apiCall('/message/reply', { threadID: threadId, body });
}

export async function sendMassMessage(userIds: number[], message: string) {
    return apiCall('/message/sendMass', { userIDs: userIds, message });
}

// ── Daily Workout endpoints ──
// dailyWorkout IDs come from calendar items (item.id, NOT item.detail.workoutID)
// dailyWorkout = scheduled instance of a workoutDef on a specific date

export async function getDailyWorkout(dailyWorkoutIds: number[]) {
    return apiCall('/dailyWorkout/get', { ids: dailyWorkoutIds });
}

/**
 * Schedule workout(s) on specific dates.
 * @param trainerID   The trainer's ID (NOT the client's — using client ID gives "User not found")
 * @param dailyWorkouts  Array of workout objects. Each needs full exercises from template.
 *   Tip: use getDailyWorkout to get a template, strip IDs, change date.
 */
export async function scheduleDailyWorkout(trainerID: number, dailyWorkouts: Array<Record<string, unknown>>) {
    return apiCall('/dailyWorkout/set', {
        userID: trainerID,
        unitWeight: 'kg',
        unitDistance: 'km',
        dailyWorkouts,
    });
}

// ── Body Stats endpoints ──
// NOTE: bodystats/get requires unitBodystats param — exact format still TBD.
// Use getClientSummary() to get latest body stats from the summary instead.

export async function getBodyStats(userId: number, date: string = 'last') {
    return apiCall('/bodystats/get', { userID: userId, date });
}

export async function addBodyStat(userId: number, data: Record<string, unknown>) {
    return apiCall('/bodystats/add', { userID: userId, ...data });
}

// ── Goal endpoints ──

export async function getGoals(userId: string) {
    return apiCall('/goal/getList', { userID: userId });
}

export async function addGoal(userId: string, data: Record<string, unknown>) {
    return apiCall('/goal/add', { userID: userId, ...data });
}

// ── Compliance endpoints ──

export async function getUserCompliance(userId: string, startDate: string, endDate: string) {
    return apiCall('/compliance/getUserCompliance', { userID: userId, startDate, endDate });
}

// ── Trainer Note endpoints ──

export async function addTrainerNote(options: {
    trainerID: number;
    clientID: number;
    content: string;
    type?: 'general' | 'workout';
    injury?: boolean;
}) {
    return apiCall('/trainerNote/add', {
        userID: options.trainerID,
        attachTo: options.clientID,
        content: options.content,
        type: options.type || 'general',
        injury: options.injury || false,
    });
}

export async function getTrainerNotes(userId: number) {
    return apiCall('/trainerNote/getList', { userID: userId });
}

// ── User Tags ──

export async function createTag(name: string) {
    return apiCall('/userTag/add', { name });
}

export async function addTagToUser(userId: number, userTag: string) {
    return apiCall('/user/addTag', { userID: userId, userTag });
}

export async function deleteTagFromUser(userId: number, userTag: string) {
    return apiCall('/user/deleteTag', { userID: userId, userTag });
}

export async function getTagList() {
    return apiCall('/userTag/getList');
}

// ── User Groups ──

export async function getGroupList() {
    return apiCall('/userGroup/getList');
}

export async function addUserToGroup(userId: string, groupId: string) {
    return apiCall('/userGroup/addUser', { userID: userId, groupID: groupId });
}

export async function removeUserFromGroup(userId: string, groupId: string) {
    return apiCall('/userGroup/deleteUser', { userID: userId, groupID: groupId });
}

// ── Calendar ──

export async function getCalendarList(userId: string, startDate: string, endDate: string) {
    return apiCall('/calendar/getList', { userID: userId, startDate, endDate });
}

// ── Workout Templates ──

export async function getWorkoutTemplateList() {
    return apiCall('/workoutTemplate/getList');
}

// ── Photos ──

export async function getPhotoList(userId: number, start = 0, count = 10) {
    return apiCall('/photos/getList', { userID: userId, start, count });
}

// ── Habits ──

export async function getHabitList(userId: number, status: 'current' | 'upcoming' | 'past' = 'current') {
    return apiCall('/habits/getList', { userID: userId, status });
}

// ── Meal Plan ──

export async function getMealPlan(userId: number) {
    return apiCall('/mealPlan/get', { userID: userId });
}

// ── Appointments ──

export async function getAppointmentTypes() {
    return apiCall('/appointment/getAppointmentTypeList', {});
}

export async function getAppointments(userId: number, startDate: string, endDate: string) {
    return apiCall('/appointment/getList', { userID: userId, startDate, endDate });
}

// ── Accomplishments ──

export async function getAccomplishments(userId: number) {
    return apiCall('/accomplishment/getList', { userID: userId });
}

// ── Exercise Management ──

export async function addExerciseToLibrary(name: string, recordType: 'Strength' | 'Cardio') {
    return apiCall('/exercise/add', { name, recordType });
}

// ── Export core helper for custom calls ──
export { apiCall };
