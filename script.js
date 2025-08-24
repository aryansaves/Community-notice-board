// Import the functions you need from the Firebase SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    signInAnonymously,
    signInWithCustomToken,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    onSnapshot,
    query,
    orderBy, // Note: orderBy can cause issues without indexes, but included for completeness if sorting is desired.
    deleteDoc,
    doc,
    serverTimestamp // For adding a timestamp to notices
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Your Firebase configuration (provided by the user)
// NOTE: In a real production app, move sensitive API keys to server-side or environment variables.
const firebaseConfig = {
    apiKey: "AIzaSyBEsnfJPj__POb9P9deBbThjJODTUtjXrk",
    authDomain: "community-notice-board-72379.firebaseapp.com",
    projectId: "community-notice-board-72379",
    storageBucket: "community-notice-board-72379.firebasestorage.app",
    messagingSenderId: "275304243014",
    appId: "1:275304243014:web:acb6b8277372bacf0f0f47",
    measurementId: "G-LVERB1VVRF"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Global variables for Firebase instances and user ID
let currentUserId = null;
let isAuthReady = false; // Flag to ensure Firestore operations happen after auth is ready

// Get DOM elements
const noticeForm = document.getElementById('notice-form');
const noticeTitleInput = document.getElementById('notice-title');
const noticeContentInput = document.getElementById('notice-content');
const noticesContainer = document.getElementById('notices-container');
const loadingMessage = document.getElementById('loading-message');
const noNoticesMessage = document.getElementById('no-notices-message');
const currentUserIdDisplay = document.getElementById('current-user-id');
const formMessage = document.getElementById('form-message');

/**
 * Displays a temporary message in the form area.
 * @param {string} message - The message to display.
 * @param {string} type - The type of message ('success' or 'error').
 */
function showFormMessage(message, type) {
    formMessage.textContent = message;
    formMessage.classList.remove('hidden', 'text-green-600', 'text-red-600');
    if (type === 'success') {
        formMessage.classList.add('text-green-600');
    } else {
        formMessage.classList.add('text-red-600');
    }
    setTimeout(() => {
        formMessage.classList.add('hidden');
    }, 3000); // Hide after 3 seconds
}

/**
 * Handles user authentication.
 * It attempts to sign in with a custom token if available, otherwise signs in anonymously.
 */
async function authenticateUser() {
    try {
        // Retrieve global variables for app_id and initial_auth_token
        // These are provided by the Canvas environment.
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }
        console.log("Firebase authentication successful.");
    } catch (error) {
        console.error("Firebase authentication failed:", error);
        // Fallback or display error to user
        showFormMessage("Authentication failed. Please try refreshing.", "error");
    }
}

/**
 * Listens for authentication state changes and sets up Firestore listeners.
 */
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserId = user.uid;
        currentUserIdDisplay.textContent = currentUserId;
        isAuthReady = true;
        console.log("User is signed in:", currentUserId);
        setupNoticesListener(); // Start listening for notices once authenticated
    } else {
        currentUserId = null;
        currentUserIdDisplay.textContent = "Not authenticated";
        isAuthReady = true; // Still set to true so other operations don't block
        console.log("No user is signed in. Attempting to authenticate...");
        authenticateUser(); // Attempt to authenticate if no user is signed in
    }
});

/**
 * Adds a new notice to Firestore.
 * @param {Event} e - The form submission event.
 */
noticeForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!isAuthReady || !currentUserId) {
        showFormMessage("Please wait, authentication is in progress...", "error");
        return;
    }

    const title = noticeTitleInput.value.trim();
    const content = noticeContentInput.value.trim();

    if (!title || !content) {
        showFormMessage("Title and content cannot be empty.", "error");
        return;
    }

    try {
        // Store notices in a public collection under /artifacts/{appId}/public/data/notices
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const noticesCollectionRef = collection(db, `artifacts/${appId}/public/data/notices`);

        await addDoc(noticesCollectionRef, {
            title: title,
            content: content,
            userId: currentUserId,
            timestamp: serverTimestamp() // Add a server-generated timestamp
        });

        console.log("Notice added successfully!");
        showFormMessage("Notice posted successfully! 🎉", "success");
        noticeTitleInput.value = '';
        noticeContentInput.value = '';
    } catch (error) {
        console.error("Error adding document: ", error);
        showFormMessage("Error posting notice. Please try again.", "error");
    }
});

/**
 * Sets up a real-time listener for notices from Firestore.
 * This function will be called only after successful authentication.
 */
function setupNoticesListener() {
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const noticesCollectionRef = collection(db, `artifacts/${appId}/public/data/notices`);

    // Create a query to get notices, ordering by timestamp in descending order
    // NOTE: Using orderBy requires an index in Firestore. If you encounter errors,
    // you might need to create an index in your Firebase console.
    // For this simple example, we'll sort in JavaScript if orderBy causes issues,
    // but Firestore's orderBy is more efficient for large datasets.
    const noticesQuery = query(noticesCollectionRef, orderBy('timestamp', 'desc'));

    // Listen for real-time updates
    onSnapshot(noticesQuery, (snapshot) => {
        loadingMessage.classList.add('hidden'); // Hide loading message
        noticesContainer.innerHTML = ''; // Clear existing notices
        const notices = [];

        snapshot.forEach((doc) => {
            notices.push({ id: doc.id, ...doc.data() });
        });

        if (notices.length === 0) {
            noNoticesMessage.classList.remove('hidden');
        } else {
            noNoticesMessage.classList.add('hidden');
            // Sort notices by timestamp in JavaScript as a fallback if orderBy is not used in query
            // notices.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());

            notices.forEach(notice => {
                displayNotice(notice);
            });
        }
    }, (error) => {
        console.error("Error fetching notices: ", error);
        loadingMessage.textContent = "Error loading notices.";
        loadingMessage.classList.remove('hidden');
        showFormMessage("Failed to load notices. Please check your connection.", "error");
    });
}

/**
 * Creates and appends a notice element to the DOM.
 * @param {Object} notice - The notice object from Firestore.
 */
function displayNotice(notice) {
    const noticeElement = document.createElement('div');
    noticeElement.id = `notice-${notice.id}`;
    noticeElement.classList.add('bg-white', 'p-6', 'rounded-lg', 'shadow-md', 'border', 'border-gray-200');

    // Format timestamp if available
    const date = notice.timestamp ? notice.timestamp.toDate().toLocaleString() : 'N/A';

    let deleteButtonHtml = '';
    // Only show delete button if the current user is the owner of the notice
    if (currentUserId && notice.userId === currentUserId) {
        deleteButtonHtml = `
            <button class="delete-notice-btn mt-4 px-4 py-2 bg-red-500 text-white text-sm font-semibold rounded-md hover:bg-red-600 transition duration-150 ease-in-out"
                    data-id="${notice.id}">
                Delete
            </button>
        `;
    }

    noticeElement.innerHTML = `
        <h3 class="text-xl font-bold text-indigo-700 mb-2">${notice.title}</h3>
        <p class="text-sm text-gray-500 mb-3">Posted by: <span class="font-medium break-all">${notice.userId}</span> on ${date}</p>
        <p class="notice-content text-gray-700">${notice.content}</p>
        ${deleteButtonHtml}
    `;

    noticesContainer.appendChild(noticeElement);

    // Add event listener for the delete button if it exists
    if (currentUserId && notice.userId === currentUserId) {
        noticeElement.querySelector('.delete-notice-btn').addEventListener('click', () => {
            deleteNotice(notice.id);
        });
    }
}

/**
 * Deletes a notice from Firestore.
 * @param {string} noticeId - The ID of the notice to delete.
 */
async function deleteNotice(noticeId) {
    if (!isAuthReady || !currentUserId) {
        showFormMessage("Authentication not ready. Cannot delete notice.", "error");
        return;
    }

    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const noticeDocRef = doc(db, `artifacts/${appId}/public/data/notices`, noticeId);

    try {
        await deleteDoc(noticeDocRef);
        console.log("Notice deleted successfully!");
        showFormMessage("Notice deleted! ✅", "success");
    } catch (error) {
        console.error("Error deleting document: ", error);
        showFormMessage("Error deleting notice. Please try again.", "error");
    }
}

// Initial call to start authentication process
authenticateUser();
