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

export async function addUser(options: {
    user: {
        email: string;
        firstname: string;
        lastname: string;
        phone?: string;
        sex?: string;
        birthDate?: string;
        role?: string;              // 'client' | 'trainer'
        status?: string;
        height?: number;
    };
    program?: {
        programID: number;
        startDate?: string;         // YYYY-MM-DD
    };
    userGroupID?: number;
    userTag?: string;
    password?: string;
    sendMail?: boolean;
    isSetup?: boolean;              // true to bypass setup process
    unitHeight?: 'inch' | 'cm';    // required if height specified
}) {
    return apiCall('/user/add', options);
}

export async function deleteUser(options: {
    userID: number;
    transferContentToUser?: number; // trainer to transfer master workout/program to
    transferClientToUser?: number;  // trainer to transfer clients to
}) {
    return apiCall('/user/delete', options);
}

export async function findUser(searchTerm: string, options?: {
    view?: 'recipient' | 'activeClientPicker' | 'allClient' | 'activeClient' | 'pendingClient' | 'deactivatedClient' | 'trainer';
    sort?: 'name' | 'dateAdded' | 'lastSignedIn' | 'lastMessaged' | 'lastTrainingPlanEndDate' | 'role';
    includeBasicMember?: boolean;
    start?: number;
    count?: number;
    verbose?: boolean;
}) {
    return apiCall('/user/find', {
        searchTerm,
        view: options?.view ?? 'allClient',
        start: options?.start ?? 0,
        count: options?.count ?? 25,
        ...(options?.sort && { sort: options.sort }),
        ...(options?.includeBasicMember !== undefined && { includeBasicMember: options.includeBasicMember }),
        ...(options?.verbose !== undefined && { verbose: options.verbose }),
    });
}

export async function getClientList(options?: {
    userID?: number;                // trainer to get clients for (default: current signed-in trainer)
    locationID?: number;            // get all clients under one location
    view?: 'allActive' | 'activeClient' | 'pendingClient' | 'deactivatedClient';
    filter?: Record<string, unknown>;
    sort?: 'name' | 'dateAdded' | 'lastSignedIn' | 'lastMessaged' | 'lastTrainingPlanEndDate';
    start?: number;
    count?: number;
    verbose?: boolean;
}) {
    return apiCall('/user/getClientList', {
        view: options?.view ?? 'allActive',
        start: options?.start ?? 0,
        count: options?.count ?? 25,
        ...(options?.userID !== undefined && { userID: options.userID }),
        ...(options?.locationID !== undefined && { locationID: options.locationID }),
        ...(options?.filter && { filter: options.filter }),
        ...(options?.sort && { sort: options.sort }),
        ...(options?.verbose !== undefined && { verbose: options.verbose }),
    });
}

export async function getClientSummary(userId: number, unitWeight?: 'kg' | 'lbs') {
    return apiCall('/user/getClientSummary', {
        userID: userId,
        ...(unitWeight && { unitWeight }),
    });
}

export async function getUserProfile(userIds: number[], unitBodystats?: 'cm' | 'inches') {
    return apiCall('/user/getProfile', {
        usersid: userIds,
        ...(unitBodystats && { unitBodystats }),
    });
}

export async function getTrainerList(options?: {
    locationID?: number;
    sort?: 'name' | 'role' | 'lastSignedIn';
    start?: number;
    count?: number;
}) {
    return apiCall('/user/getTrainerList', {
        ...(options?.locationID !== undefined && { locationID: options.locationID }),
        sort: options?.sort ?? 'name',
        start: options?.start ?? 0,
        count: options?.count ?? 10,
    });
}

export async function getUserSettings(userId: number) {
    return apiCall('/user/getSettings', { userID: userId });
}

export async function getSetupLink(userId: number) {
    return apiCall('/user/getSetupLink', { userID: userId });
}

export async function getLoginToken(options: {
    userID: number;
    duration?: number;              // seconds, 12 hour max
    able?: boolean;                 // reusable or one-time usage
}) {
    return apiCall('/user/getLoginToken', {
        userID: options.userID,
        duration: options.duration ?? 3600,
        able: options.able ?? false,
    });
}

export async function switchTrainer(options: {
    userID: number;
    email?: string;
    trainerID?: number;
}) {
    return apiCall('/user/switchTrainer', options);
}

export async function setUserProfile(options: {
    unitBodystats?: 'cm' | 'inches';
    user: Record<string, unknown>;  // user profile fields
}) {
    return apiCall('/user/setProfile', options);
}

export async function setUserStatus(options: {
    userID: number;
    email?: string;
    accountStatus: 'active' | 'deactivated' | 'pending';
    enableSignin?: boolean;
    enableMessage?: boolean;
}) {
    return apiCall('/user/setStatus', options);
}

export async function setPrivilege(options: {
    userID: number;
    role: 'trainer' | 'sharedTrainer' | 'manager' | 'admin';
}) {
    return apiCall('/user/setPrivilege', options);
}

export async function setUserTags(userId: number, userTags: string[]) {
    return apiCall('/user/setTag', { userID: userId, userTags });
}

// ── Program endpoints ──

export async function addUserToProgram(options: {
    id: number;                     // program ID
    userID: number;
    startDate?: string;             // YYYY-MM-DD
    subscribeType?: 'core' | 'addon';  // Multiple Programs beta — default 'core'
}) {
    return apiCall('/program/addUser', {
        id: options.id,
        userID: options.userID,
        startDate: options.startDate ?? new Date().toISOString().split('T')[0],
        ...(options.subscribeType && { subscribeType: options.subscribeType }),
    });
}

export async function copyProgramToUser(options: {
    id: number;                     // program ID
    userID: number;
    startDate?: string;             // YYYY-MM-DD
    forceMerge?: boolean;
}) {
    return apiCall('/program/copyToUser', {
        id: options.id,
        userID: options.userID,
        startDate: options.startDate ?? new Date().toISOString().split('T')[0],
        ...(options.forceMerge !== undefined && { forceMerge: options.forceMerge }),
    });
}

export async function copyTrainingPlanToClient(options: {
    trainingPlanID: number;
    userID: number;
    startDate?: string;             // YYYY-MM-DD
    forceMerge?: boolean;
}) {
    return apiCall('/program/copyTrainingPlanToClient', options);
}

export async function removeUserFromProgram(programId: number, userId: number) {
    return apiCall('/program/deleteUser', { id: programId, userID: userId });
}

export async function getProgram(programId: number) {
    return apiCall('/program/get', { id: programId });
}

export async function getProgramCalendarList(options: {
    id: number;                     // program ID
    startDay?: number;
    endDay?: number;
}) {
    return apiCall('/program/getCalendarList', {
        id: options.id,
        startDay: options.startDay ?? 0,
        endDay: options.endDay ?? 28,
    });
}

export async function getProgramTrainingPlanList(programId: number) {
    return apiCall('/program/getTrainingPlanList', { id: programId });
}

export async function getProgramList(options?: {
    type?: 'all' | 'shared' | 'mine' | 'other';
    tag?: number;                   // 0 for programs without tags
    userID?: number;
    includeHQ?: boolean;
}) {
    return apiCall('/program/getList', {
        type: options?.type ?? 'all',
        ...(options?.tag !== undefined && { tag: options.tag }),
        ...(options?.userID !== undefined && { userID: options.userID }),
        ...(options?.includeHQ !== undefined && { includeHQ: options.includeHQ }),
    });
}

export async function getProgramUserList(options: {
    id: number;                     // program ID
    sort?: 'name' | 'startDate' | 'userGroup';
    start?: number;                 // null for all users
    count?: number;
}) {
    return apiCall('/program/getUserList', options);
}

export async function getUserProgramList(userId: number) {
    return apiCall('/program/getUserProgramList', { userID: userId });
}

export async function moveProgram(options: {
    id: number;                     // program ID
    userID: number;
    type: 'shared' | 'mine' | 'other';
    forceType?: 'rename';
}) {
    return apiCall('/program/move', options);
}

export async function setUserProgram(options: {
    userID: number;
    userProgramID?: number;         // null to switch customer program
    startDate?: string;             // YYYY-MM-DD
    subscribeType?: string;         // can only switch addon to core
}) {
    return apiCall('/program/setUserProgram', options);
}

// ── Training Plan endpoints ──

export async function getTrainingPlanList(userId: number) {
    return apiCall('/trainingPlan/getList', { userid: userId }); // NOTE: lowercase 'userid'
}

export async function getWorkoutDefListForPlan(planId: number, options?: {
    searchTerm?: string;
    start?: number;
    count?: number;
    filter?: Record<string, unknown>;
}) {
    return apiCall('/trainingPlan/getWorkoutDefList', {
        planID: planId,
        start: options?.start ?? 0,
        count: options?.count ?? 50,
        ...(options?.searchTerm && { searchTerm: options.searchTerm }),
        ...(options?.filter && { filter: options.filter }),
    });
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

export async function deleteTrainingPlan(planId: number, closeGap?: 0 | 1) {
    return apiCall('/trainingPlan/delete', {
        planid: planId,             // NOTE: lowercase 'planid' — API requires this exact casing
        ...(closeGap !== undefined && { closeGap }),
    });
}

// ── Workout Definition endpoints ──
// WorkoutDef structure: { id, name, exercises: [{ def: { id, name, sets, target, restTime, recordType, supersetType, ... } }] }

export async function getWorkoutDef(workoutDefIds: number[]) {
    return apiCall('/workoutDef/get', { ids: workoutDefIds });
}

export async function setWorkoutDef(workoutDef: {
    id: number;
    name?: string;
    instructions?: string;
    exercises?: Array<{
        def: {
            id: number;
            name?: string;
            description?: string;
            sets?: number;
            target?: string;
            targetDetail?: Record<string, unknown>;
            side?: 'left' | 'right' | null;
            supersetID?: number;
            supersetType?: 'superset' | 'circuit' | 'none';
            intervalTime?: number;          // seconds
            restTime?: number;
            recordType?: 'general' | 'strength' | 'endurance' | 'timedFasterBetter' | 'timedLongerBetter' | 'timedStrength' | 'cardio' | 'rest';
            type?: 'system' | 'custom';
            vimeoVideo?: string;            // if type=system
            youTubeVideo?: string;          // if type=custom
            numPhotos?: number;
        };
    }>;
    tags?: Array<{ id: number }>;
    trackingStats?: {
        def?: {
            effortInterval?: boolean;
            restInterval?: boolean;
            minHeartRate?: boolean;
            maxHeartRate?: boolean;
            avgHeartRate?: boolean;
            zone?: boolean;
        };
    };
}) {
    return apiCall('/workoutDef/set', { workoutDef });
}

export async function addWorkoutDef(options: {
    type?: 'shared' | 'mine' | 'other' | 'trainingPlan';
    userID?: number;                // trainerID if private
    trainingPlanID?: number;        // training plan ID if type=trainingPlan
    workoutDef: {
        name: string;
        type?: 'cardio' | 'workoutRegular' | 'workoutCircuit' | 'workoutTimed' | 'workoutInterval' | 'workoutVideo';
        instructions?: string;
        exercises: Array<{
            def: {
                id: number;
                sets?: number;
                target?: string;
                targetDetail?: Record<string, unknown>;
                side?: 'left' | 'right' | null;
                supersetID?: number;
                supersetType?: 'superset' | 'circuit' | 'none';
                intervalTime?: number;  // seconds, for timed/interval workouts
                restTime?: number;
                recordType?: string;
                superSetID?: number;    // legacy alias
            };
        }>;
        tags?: Array<{ id: number }>;
        trackingStats?: {
            def?: {
                effortInterval?: boolean;
                restInterval?: boolean;
                minHeartRate?: boolean;
                maxHeartRate?: boolean;
                avgHeartRate?: boolean;
                zone?: boolean;
            };
        };
    };
}) {
    return apiCall('/workoutDef/add', options);
}

// ── Exercise endpoints ──

export async function getExercise(exerciseId: number) {
    return apiCall('/exercise/get', { id: exerciseId });
}

export async function setExercise(options: {
    id: number;
    name?: string;
    alternateName?: string;
    description?: string;
    recordType?: 'general' | 'strength' | 'endurance' | 'timedFasterBetter' | 'timedLongerBetter' | 'timedStrength' | 'cardio';
    tag?: 'arms' | 'shoulder' | 'chest' | 'back' | 'abs' | 'legs' | 'cardio' | 'fullBody' | 'none';
    videoUrl?: string;
    videoType?: 'youtube' | 'vimeo';
    videoStatus?: 'processing' | 'ready' | 'failing';
    videoTrainerType?: string;
    tags?: Array<Record<string, unknown>>;
}) {
    return apiCall('/exercise/set', options);
}

export async function addExercise(options: {
    name: string;
    alternateName?: string;
    description?: string;
    recordType?: 'general' | 'strength' | 'endurance' | 'timedFasterBetter' | 'timedLongerBetter' | 'timedStrength' | 'cardio';
    tag?: 'arms' | 'shoulder' | 'chest' | 'back' | 'abs' | 'legs' | 'cardio' | 'fullBody' | 'none';
    videoUrl?: string;
    videoType?: 'youtube' | 'vimeo';
    videoStatus?: 'processing' | 'ready' | 'failing';
    videoTrainerType?: string;
    tags?: Array<Record<string, unknown>>;
}) {
    return apiCall('/exercise/add', options);
}

// ── Location endpoints ──

export async function getLocationList(groupID?: number) {
    return apiCall('/location/getList', {
        ...(groupID !== undefined && { groupID }),
    });
}

// ── Message endpoints ──

export async function getMessageThreads(userId: number, options?: {
    view?: 'inbox' | 'byClient' | 'archived';
    clientID?: number;
    start?: number;
    count?: number;
}) {
    return apiCall('/message/getThreads', {
        userID: userId,
        view: options?.view ?? 'inbox',
        ...(options?.clientID !== undefined && { clientID: options.clientID }),
        ...(options?.start !== undefined && { start: options.start }),
        ...(options?.count !== undefined && { count: options.count }),
    });
}

export async function getMessage(messageId: number) {
    return apiCall('/message/get', { messageID: messageId });
}

export async function sendMessage(options: {
    userID: number;             // Message Sender ID
    recipients: number[];
    subject: string;
    body: string;
    threadType?: 'mainThread' | 'otherThread';
    conversationType?: 'group' | 'single';
    type?: 'text' | 'appear';
    appearRoom?: string;
}) {
    return apiCall('/message/send', {
        userID: options.userID,
        recipients: options.recipients,
        subject: options.subject,
        body: options.body,
        threadType: options.threadType ?? 'mainThread',
        conversationType: options.conversationType ?? 'single',
        type: options.type ?? 'text',
        ...(options.appearRoom && { appearRoom: options.appearRoom }),
    });
}

export async function replyToMessage(options: {
    userID?: number;            // Message Sender ID (only group level Auth can send on behalf of others)
    threadID: number;
    body: string;
    type?: 'text' | 'appear';
    appearRoom?: string;
}) {
    return apiCall('/message/reply', options);
}

export async function sendMassMessage(options: {
    userID: number;             // Message Sender ID
    recipients: number[];
    body: string;
    type?: 'text' | 'appear';
    threadType?: 'mainThread' | 'otherThread';
    conversationType?: 'group' | 'single';
}) {
    return apiCall('/message/sendMass', {
        userID: options.userID,
        recipients: options.recipients,
        body: options.body,
        type: options.type ?? 'text',
        threadType: options.threadType ?? 'mainThread',
        conversationType: options.conversationType ?? 'group',
    });
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
export async function scheduleDailyWorkout(options: {
    userID: number;
    dailyWorkouts: Array<Record<string, unknown>>;
    unitWeight?: 'kg' | 'lbs';
    unitDistance?: 'km' | 'miles';
}) {
    return apiCall('/dailyWorkout/set', {
        userID: options.userID,
        unitWeight: options.unitWeight ?? 'kg',
        unitDistance: options.unitDistance ?? 'km',
        dailyWorkouts: options.dailyWorkouts,
    });
}

// ── Body Stats endpoints ──

export async function addBodyStat(userId: number, options: {
    date: string;       // YYYY-MM-DD
    status?: string;    // e.g. 'scheduled'
}) {
    return apiCall('/bodystats/add', {
        userID: userId,
        date: options.date,
        ...(options.status && { status: options.status }),
    });
}

export async function deleteBodyStat(options: {
    id?: number;        // bodystats id
    userID?: number;
    date?: string;      // YYYY-MM-DD
}) {
    return apiCall('/bodystats/delete', options);
}

export async function getBodyStats(userId: number, options?: {
    date?: string;              // YYYY-MM-DD or 'last'
    unitBodystats?: 'cm' | 'inches';
    unitWeight?: 'kg' | 'lbs';
}) {
    return apiCall('/bodystats/get', {
        userID: userId,
        date: options?.date ?? 'last',
        unitBodystats: options?.unitBodystats ?? 'cm',
        unitWeight: options?.unitWeight ?? 'kg',
    });
}

export async function setBodyStats(userId: number, options: {
    date: string;               // YYYY-MM-DD
    unitWeight?: string;        // e.g. 'kg'
    unitBodystats?: string;     // e.g. 'cm'
    bodyMeasures?: Record<string, unknown>;
}) {
    return apiCall('/bodystats/set', {
        userid: userId,         // NOTE: lowercase 'userid' — API requires this exact casing
        date: options.date,
        ...(options.unitWeight && { unitWeight: options.unitWeight }),
        ...(options.unitBodystats && { unitBodystats: options.unitBodystats }),
        ...(options.bodyMeasures && { bodyMeasures: options.bodyMeasures }),
    });
}

// ── File Upload ──
// NOTE: This endpoint requires multipart/form-data, not JSON.
// The 'file' field contains the binary, 'data' field contains a JSON object.

export async function uploadFile(file: Blob, data: Record<string, unknown>) {
    const url = `${BASE_URL}/file/upload`;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('data', JSON.stringify(data));

    log.info({ endpoint: '/file/upload' }, 'API call (multipart)');

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': getAuthHeader(),
            },
            body: formData,
        });

        const text = await res.text();
        let parsed: any;
        try { parsed = JSON.parse(text); } catch { parsed = { rawText: text }; }

        if (!res.ok) {
            log.error({ endpoint: '/file/upload', status: res.status, data: parsed }, 'API error');
            return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}`, status: res.status, raw: parsed };
        }

        log.info({ endpoint: '/file/upload', status: res.status }, 'API call succeeded');
        return { ok: true, data: parsed, status: res.status, raw: parsed };
    } catch (err: any) {
        log.error({ endpoint: '/file/upload', error: err.message }, 'API call failed');
        return { ok: false, error: err.message };
    }
}

// ── Goal endpoints ──

export async function getGoals(userId: number, options?: {
    unitWeight?: 'kg' | 'lbs';
    achieved?: boolean;
    start?: number;
    count?: number;
}) {
    return apiCall('/goal/getList', {
        userID: userId,
        ...(options?.unitWeight && { unitWeight: options.unitWeight }),
        ...(options?.achieved !== undefined && { achieved: options.achieved }),
        ...(options?.start !== undefined && { start: options.start }),
        ...(options?.count !== undefined && { count: options.count }),
    });
}

export async function getGoal(options: {
    id: number;
    achieved?: boolean;
    unitWeight?: 'kg' | 'lbs';
}) {
    return apiCall('/goal/get', options);
}

export async function addGoal(options: {
    userID: number;
    type: 'textGoal' | 'weightGoal' | 'nutritionGoal';
    text?: string;
}) {
    return apiCall('/goal/add', options);
}

export async function setGoal(options: {
    userID: number;
    type: 'textGoal' | 'weightGoal' | 'nutritionGoal';
    text?: string;
}) {
    return apiCall('/goal/set', options);
}

export async function deleteGoal(goalId: number) {
    return apiCall('/goal/delete', { id: goalId });
}

export async function setGoalProgress(goalId: number, progress: number) {
    return apiCall('/goal/setProgress', { id: goalId, progress });
}

// ── Compliance endpoints ──

export async function getUserCompliance(userId: number, startDate: string, endDate: string) {
    return apiCall('/compliance/getUserCompliance', { userID: userId, startDate, endDate });
}

export async function getGroupCompliance(groupId: number, startDate: string, endDate: string) {
    return apiCall('/compliance/getGroupCompliance', { groupID: groupId, startDate, endDate });
}

// ── Daily Cardio endpoints ──

export async function addDailyCardio(options: {
    userID: number;
    exerciseID: number;
    date: string;               // YYYY-MM-DD
    target?: string;
    targetDetail?: Record<string, unknown>;
    unitDistance?: 'km' | 'miles';
    from?: 'garmin' | 'googleFit' | 'fitbit';
}) {
    return apiCall('/dailyCardio/add', options);
}

export async function getDailyCardio(options: {
    id: number;                 // cardio workout id
    userID?: number;            // client ID
    unitDistance?: 'km' | 'miles';
}) {
    return apiCall('/dailyCardio/get', options);
}

export async function setDailyCardio(options: {
    id: number;                 // cardio workout id
    userID?: number;            // client ID
    name?: string;
    date?: string;              // YYYY-MM-DD
    startTime?: string;         // YYYY-MM-DD HH:MI:SS
    endTime?: string;           // YYYY-MM-DD HH:MI:SS
    workDuration?: number;      // duration in seconds
    target?: string;
    targetDetail?: Record<string, unknown>;
    notes?: string;
    status?: 'scheduled' | 'checkedIn' | 'tracked';
    unitDistance?: 'km' | 'miles';
    distance?: number;
    time?: number;              // in seconds
    calories?: number;
    activeCalories?: number;
    level?: number;
    speed?: number;
    maxHeartRate?: number;
    avgHeartRate?: number;
    location?: 'indoor' | 'outdoor';
    comments?: Array<Record<string, unknown>>;
}) {
    return apiCall('/dailyCardio/set', options);
}

// ── Daily Nutrition endpoints ──

export async function getDailyNutritionList(options: {
    userID: number;
    startDate?: string;         // YYYY-MM-DD HH:MI:SS
    endDate?: string;           // YYYY-MM-DD HH:MI:SS
}) {
    return apiCall('/dailyNutrition/getList', options);
}

export async function getDailyNutrition(options: {
    id?: number;                // dailyNutrition ID
    userID: number;
    date?: string;              // YYYY-MM-DD
}) {
    return apiCall('/dailyNutrition/get', options);
}

export async function getCustomFoodList(options?: {
    userID?: number;            // client ID, search by user
    groupID?: number;           // for client level food
    searchTerm?: string;
    sort?: 'lastModified' | 'name' | 'calories';
    start?: number;
    count?: number;
}) {
    return apiCall('/dailyNutrition/getCustomFoodList', options || {});
}

export async function addCustomFood(options: {
    groupId?: number;           // for group level food
    userId?: number;            // for client level food
    name: string;
    barcode?: string;           // must be unique within the group
    serving?: Array<Record<string, unknown>>;
}) {
    return apiCall('/dailyNutrition/addCustomFood', options);
}

export async function setCustomFood(options: {
    foodId: number;
    name?: string;
    barcode?: string;           // must be unique within the group
    serving?: Array<Record<string, unknown>>;
}) {
    return apiCall('/dailyNutrition/setCustomFood', options);
}

export async function deleteCustomFood(options: {
    userID?: number;            // client ID
    foodId: number;
}) {
    return apiCall('/dailyNutrition/deleteCustomFood', options);
}

export async function getMealTemplate(mealTemplateId: number, multiplier?: number) {
    return apiCall('/dailyNutrition/getMealTemplate', {
        mealTemplateId,
        ...(multiplier !== undefined && { multiplier }),
    });
}

export async function getMealTemplateList(options?: {
    userId?: number;            // for saved meals
    groupId?: number;           // for meal library
    start?: number;
    count?: number;
    searchTerm?: string;
    filters?: Record<string, unknown>;
}) {
    return apiCall('/dailyNutrition/getMealTemplateList', options || {});
}

export async function addMealTemplate(options: {
    templateType?: string;
    groupId?: number;
    mealName: string;
    mealTypes?: Array<'breakfast' | 'lunch' | 'dinner' | 'snacks'>;
    description?: string;
    macroSplit?: 'balanced' | 'lowCarb' | 'lowFat' | 'highProtein';
    prepareTime?: number;
    cookTime?: number;
    recipeServingAmount?: number;
    cookInstruction?: Array<Record<string, unknown>>;
    foods?: Array<Record<string, unknown>>;
    includes?: Array<'meat' | 'fish' | 'shellfish' | 'soy' | 'treeNuts' | 'eggs' | 'dairy' | 'gluten' | 'peanuts'>;
    tags?: Array<'paleo' | 'highFiber' | 'onePot' | 'slowCooker' | 'salad' | 'soup' | 'smoothie' | 'instantPot'>;
    manualFoods?: string;
    isManual?: boolean;
    isPublished?: boolean;
}) {
    return apiCall('/dailyNutrition/addMealTemplate', options);
}

export async function setMealTemplate(options: {
    mealTemplateId: number;
    mealName?: string;
    mealTypes?: Array<'breakfast' | 'lunch' | 'dinner' | 'snacks'>;
    description?: string;
    macroSplit?: 'balanced' | 'lowCarb' | 'lowFat' | 'highProtein';
    prepareTime?: number;
    cookTime?: number;
    recipeServingAmount?: number;
    cookInstruction?: Array<Record<string, unknown>>;
    foods?: Array<Record<string, unknown>>;
    tags?: Array<'paleo' | 'highFiber' | 'onePot' | 'slowCooker' | 'salad' | 'soup' | 'smoothie' | 'instantPot'>;
    includes?: Array<'meat' | 'fish' | 'shellfish' | 'soy' | 'treeNuts' | 'eggs' | 'dairy' | 'gluten' | 'peanuts'>;
    manualFoods?: string;
    isManual?: boolean;
    isPublished?: boolean;
}) {
    return apiCall('/dailyNutrition/setMealTemplate', options);
}

export async function deleteMealTemplate(mealTemplateId: number) {
    return apiCall('/dailyNutrition/deleteMealTemplate', { mealTemplateId });
}

// ── Trainer Note endpoints ──

export async function addTrainerNote(options: {
    userID: number;             // client's ID
    content: string;
    type?: 'general' | 'workout';
    attachTo?: number;          // dailyWorkoutID — mandatory for type 'workout'
    injury?: boolean;
}) {
    return apiCall('/trainerNote/add', {
        userID: options.userID,
        content: options.content,
        type: options.type ?? 'general',
        injury: options.injury ?? false,
        ...(options.attachTo !== undefined && { attachTo: options.attachTo }),
    });
}

export async function getTrainerNote(options: {
    userID: number;             // client's ID
    type: 'workout';
    attachTo: number;           // attached object ID
}) {
    return apiCall('/trainerNote/get', options);
}

export async function getTrainerNotes(clientId: number, options?: {
    start?: number;
    count?: number;
    filterType?: 'general' | 'pinned' | 'workout';
    searchTerm?: string;
}) {
    return apiCall('/trainerNote/getList', {
        userID: clientId,
        start: options?.start ?? 0,
        count: options?.count ?? 50,
        ...(options?.filterType && { filterType: options.filterType }),
        ...(options?.searchTerm && { searchTerm: options.searchTerm }),
    });
}

export async function setTrainerNote(options: {
    id: number;                 // trainer note ID
    content?: string;
    injury?: boolean;
}) {
    return apiCall('/trainerNote/set', options);
}

export async function deleteTrainerNote(noteId: number) {
    return apiCall('/trainerNote/delete', { id: noteId });
}

// ── User Notifications ──

export async function getUnreadNotificationCount(userId: number) {
    return apiCall('/userNotification/getUnreadCount', { userID: userId });
}

// ── User Tags ──

export async function createTag(name: string) {
    return apiCall('/userTag/add', { name });
}

export async function deleteTag(name: string) {
    return apiCall('/userTag/delete', { name });
}

export async function getTagList() {
    return apiCall('/userTag/getList');
}

export async function renameTag(oldName: string, newName: string) {
    return apiCall('/userTag/rename', { oldName, newName });
}

export async function addTagToUser(userId: number, userTag: string) {
    return apiCall('/user/addTag', { userID: userId, userTag });
}

export async function deleteTagFromUser(userId: number, userTag: string) {
    return apiCall('/user/deleteTag', { userID: userId, userTag });
}

// ── User Groups ──

export async function addUserGroup(options: {
    name: string;
    icon?: string;                  // e.g. 'tr-emoji-apple'
    type?: 'trainingGroup' | 'fitnessCommunity' | 'nutritionCommunicty' | 'custom';
}) {
    return apiCall('/userGroup/add', options);
}

export async function addUserToGroup(options: {
    id: number;                     // user group ID
    email?: string;
    userID?: number;
}) {
    return apiCall('/userGroup/addUser', options);
}

export async function deleteUserFromGroup(groupId: number, userId: number) {
    return apiCall('/userGroup/deleteUser', { id: groupId, userID: userId });
}

export async function deleteUserGroup(groupId: number) {
    return apiCall('/userGroup/delete', { id: groupId });
}

export async function getUserGroup(groupId: number) {
    return apiCall('/userGroup/get', { id: groupId });
}

export async function getGroupList(options?: {
    view?: 'all' | 'mine';
    start?: number;
    count?: number;
}) {
    return apiCall('/userGroup/getList', {
        view: options?.view ?? 'all',
        start: options?.start ?? 0,
        count: options?.count ?? 10,
    });
}

export async function getGroupAddons(groupId: number) {
    return apiCall('/userGroup/getAddons', { id: groupId });
}

export async function getGroupUserList(groupId: number) {
    return apiCall('/userGroup/getUserList', { id: groupId });
}

export async function setUserGroup(options: {
    id: number;
    name?: string;
    icon?: string;                  // e.g. 'tr-emoji-apple'
}) {
    return apiCall('/userGroup/set', options);
}

export async function setGroupAddons(options: {
    id: number;                     // user group ID
    addOns: Record<string, unknown>;
}) {
    return apiCall('/userGroup/setAddons', options);
}

// ── Calendar ──

export async function getCalendarList(userId: number, startDate: string, endDate: string, options?: {
    unitDistance?: 'km' | 'miles';
    unitWeight?: 'kg' | 'lbs';
}) {
    return apiCall('/calendar/getList', {
        userID: userId,
        startDate,
        endDate,
        unitDistance: options?.unitDistance ?? 'km',
        unitWeight: options?.unitWeight ?? 'kg',
    });
}

// ── Challenges ──

export async function getChallengeList(view?: 'mine' | 'all') {
    return apiCall('/challenge/getList', {
        ...(view && { view }),
    });
}

export async function getChallengeLeaderboardParticipants(options: {
    challengeID: number;
    userID?: number;
    searchTerm?: string;
    reversed?: 'true' | 'false';
    start?: number;
    count?: number;
    preload?: number;
}) {
    return apiCall('/challenge/getLeaderboardParticipantList', options);
}

export async function getChallengeThresholdParticipants(options: {
    challengeID: number;
    searchTerm?: string;
    level?: 'level0' | 'level1' | 'level2' | 'level3' | 'level4';
    start?: number;
    count?: number;
}) {
    return apiCall('/challenge/getThresholdParticipantList', options);
}

export async function addChallengeParticipants(challengeID: number, userIDs: number[]) {
    return apiCall('/challenge/addParticipants', { challengeID, userIDs });
}

export async function removeChallengeParticipants(challengeID: number, userIDs: number[]) {
    return apiCall('/challenge/removeParticipants', { challengeID, userIDs });
}

// ── Workout Templates ──

export async function getWorkoutTemplateList(options?: {
    view?: 'shared' | 'mine' | 'other' | 'all';
    tags?: number[];                // 0 for programs without tags
    userID?: number;
    sort?: 'name' | 'dateCreated' | 'dateUpdated';
    searchTerm?: string;
    start?: number;
    count?: number;
}) {
    return apiCall('/workoutTemplate/getList', options ?? {});
}

// ── Photos ──

export async function getPhotoList(userId: number, startDate: string, endDate: string) {
    return apiCall('/photos/getList', { userID: userId, startDate, endDate });
}

export async function getPhotoByID(options: {
    userID: number;
    photoid: number;
    thumbnail?: boolean;
}) {
    return apiCall('/photos/getByID', options);
}

// NOTE: photos/add requires multipart/form-data, not JSON.
export async function addPhoto(file: Blob, data: { userID: number; date: string; type?: string }) {
    const url = `${BASE_URL}/photos/add`;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('data', JSON.stringify(data));

    log.info({ endpoint: '/photos/add' }, 'API call (multipart)');

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': getAuthHeader() },
            body: formData,
        });

        const text = await res.text();
        let parsed: any;
        try { parsed = JSON.parse(text); } catch { parsed = { rawText: text }; }

        if (!res.ok) {
            log.error({ endpoint: '/photos/add', status: res.status, data: parsed }, 'API error');
            return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}`, status: res.status, raw: parsed };
        }

        log.info({ endpoint: '/photos/add', status: res.status }, 'API call succeeded');
        return { ok: true, data: parsed, status: res.status, raw: parsed };
    } catch (err: any) {
        log.error({ endpoint: '/photos/add', error: err.message }, 'API call failed');
        return { ok: false, error: err.message };
    }
}

// ── Habits ──

export async function addHabit(options: {
    userID: number;
    type: 'customHabit' | 'eatProtein' | 'eatGoodFat' | 'eatComplexCarb' | 'eatVeggie' | 'followPortionGuide' | 'practiceEatingSlowly' | 'eatUntilAlmostFull' | 'prepareYourOwnMeal' | 'drinkOnlyZeroCalorieDrink' | 'abstainFromAlcohol' | 'takeAMoreActiveRoute' | 'makeItEasierToWorkout' | 'doAnEnjoyableActivity' | 'recruitSocialSupport' | 'rewardYourselfAfterAWorkout' | 'prioritizeSelfCare' | 'celebrateAWin' | 'digitalDetoxOneHourBeforeBed' | 'practiceBedtimeRitual';
    name?: string;
    customTypeID?: number;          // Custom Habit Type from Habits Master Library
    startDate?: string;             // YYYY-MM-DD
    durationType?: string;          // e.g. 'week'
    duration?: number;
    repeatDetail?: Record<string, unknown>;
    habitsDetail?: Record<string, unknown>;
}) {
    return apiCall('/habits/add', options);
}

export async function deleteDailyHabit(userId: number, dailyItemID: number) {
    return apiCall('/habits/deleteDailyItem', { userID: userId, dailyItemID });
}

export async function getHabitList(userId: number, options?: {
    status?: 'current' | 'upcoming' | 'past';
    start?: number;
    count?: number;
}) {
    return apiCall('/habits/getList', {
        userID: userId,
        status: options?.status ?? 'current',
        start: options?.start ?? 0,
        count: options?.count ?? 10,
    });
}

export async function getDailyHabit(userId: number, dailyItemID: number) {
    return apiCall('/habits/getDailyItem', { userID: userId, dailyItemID });
}

export async function setDailyHabit(userId: number, dailyItemID: number, status: string) {
    return apiCall('/habits/setDailyItem', { userID: userId, dailyItemID, status });
}

// ── Health Data ──

export async function getHealthDataList(options: {
    userID: number;
    type: 'step' | 'restingHeartRate' | 'sleep' | 'bloodPressure' | 'calorieOut';
    startDate: string;              // YYYY-MM-DD
    endDate: string;                // YYYY-MM-DD
}) {
    return apiCall('/healthData/getList', options);
}

export async function getHealthDataSleep(options: {
    userID: number;
    startTime: string;              // YYYY-MM-DD HH:MM:SS
    endDate: string;                // YYYY-MM-DD HH:MM:SS
}) {
    return apiCall('/healthData/getListSleep', options);
}

// ── Meal Plan ──

export async function getMealPlan(options: {
    id?: number;                // mealPlanID
    userid?: number;            // NOTE: lowercase 'userid' — retrieve by client ID
}) {
    return apiCall('/mealPlan/get', options);
}

export async function setMealPlan(userId: number, mealPlan: Record<string, unknown>) {
    return apiCall('/mealPlan/set', { userID: userId, mealPlan });
}

export async function deleteMealPlan(userId: number) {
    return apiCall('/mealPlan/delete', { userID: userId });
}

export async function generateMealPlan(options: {
    userId: number;             // NOTE: camelCase 'userId'
    caloriesTarget: number;
    macroSplit: 'balanced' | 'lowCarb' | 'lowFat' | 'highProtein';
    mealsPerDay: number;        // range [3, 6]
    sampleDays: number;         // range [1, 3]
    excludes: Array<'fish' | 'shellfish' | 'soy' | 'treeNuts' | 'eggs' | 'dairy' | 'gluten' | 'peanuts' | 'meat'>;
}) {
    return apiCall('/mealPlan/generate', options);
}

// ── Appointments ──

export async function addAppointment(options: {
    userID: number;
    startDate: string;
    endDate: string;
    appointmentTypeID: number;
    notes?: string;
    actionInfo?: {
        isRecurring?: boolean;
        recurrenceRoot?: number;
        recurrencePattern?: Record<string, unknown>;
    };
    attendents?: Array<Record<string, unknown>>;
}) {
    return apiCall('/appointment/add', options);
}

export async function getAppointmentTypes(options?: {
    start?: number;
    count?: number;
    filter?: {
        ignoreDeleted?: boolean;
        ignoreVideoCall?: boolean;
        ignoreExternal?: boolean;
    };
}) {
    return apiCall('/appointment/getAppointmentTypeList', {
        start: options?.start ?? 0,
        count: options?.count ?? 10,
        ...(options?.filter && { filter: options.filter }),
    });
}

export async function getAppointmentType(appointmentTypeId: number) {
    return apiCall('/appointment/getAppointmentType', { getAppointmentType: appointmentTypeId });
}

export async function getAppointments(userId: number, startDate: string, endDate: string) {
    return apiCall('/appointment/getList', { userID: userId, startDate, endDate });
}

// ── Accomplishments ──

export async function getAccomplishments(userId: number, options?: {
    start?: number;
    count?: number;
}) {
    return apiCall('/accomplishment/getList', {
        userID: userId,
        start: options?.start ?? 0,
        count: options?.count ?? 10,
    });
}

export async function getAccomplishmentStats(userId: number, options?: {
    category?: 'goalHabit' | 'workoutBrokenRecord' | 'workoutMilestone' | 'cardioBrokenRecord' | 'cardioMilestone';
    start?: number;
    count?: number;
}) {
    return apiCall('/accomplishment/getStatsList', {
        userID: userId,
        ...(options?.category && { category: options.category }),
        start: options?.start ?? 0,
        count: options?.count ?? 10,
    });
}



// ── Export core helper for custom calls ──
export { apiCall };
