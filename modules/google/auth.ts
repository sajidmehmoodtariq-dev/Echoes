import {
    GoogleSignin,
    isSuccessResponse,
    type User,
} from '@react-native-google-signin/google-signin';

// ============================================================
// IMPORTANT: Replace this with your actual Web Client ID from
// Google Cloud Console → APIs & Services → Credentials
// (Create an OAuth 2.0 Client ID of type "Web application")
// ============================================================
const WEB_CLIENT_ID = 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com';

/**
 * Configures Google Sign-In with Drive file scope.
 * Call once at app startup (e.g., in ChatProvider useEffect).
 */
export function configureGoogleSignIn(): void {
    GoogleSignin.configure({
        webClientId: WEB_CLIENT_ID,
        scopes: ['https://www.googleapis.com/auth/drive.file'],
        offlineAccess: true,
    });
}

/**
 * Triggers the Google Sign-In flow.
 * Returns the user object on success, null on cancel/failure.
 */
export async function signIn(): Promise<User | null> {
    try {
        await GoogleSignin.hasPlayServices();
        const response = await GoogleSignin.signIn();
        if (isSuccessResponse(response)) {
            return response.data;
        }
        return null;
    } catch (error: any) {
        console.error('[GoogleAuth] Sign-in error:', error);
        throw error;
    }
}

/**
 * Signs out the current user.
 */
export async function signOut(): Promise<void> {
    try {
        await GoogleSignin.signOut();
    } catch (error) {
        console.error('[GoogleAuth] Sign-out error:', error);
    }
}

/**
 * Returns the currently signed-in user, or null.
 */
export function getCurrentUser(): User | null {
    return GoogleSignin.getCurrentUser();
}

/**
 * Checks if a user is currently signed in.
 */
export function isSignedIn(): boolean {
    return getCurrentUser() !== null;
}

/**
 * Gets a fresh access token for API calls.
 * The SDK handles token refresh automatically.
 */
export async function getAccessToken(): Promise<string> {
    const tokens = await GoogleSignin.getTokens();
    return tokens.accessToken;
}
