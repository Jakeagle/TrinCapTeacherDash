# Teacher Dashboard Frontend Brief

This document provides a high-level overview of the teacher dashboard frontend, focusing on the messaging system. This information is synthesized from the backend `server.js` file and the student-facing `script.js` file.

## Core Purpose

The teacher dashboard is a web application that allows teachers to:
- View and manage their student rosters.
- Monitor the academic and financial health of their classes.
- Assign and manage lesson units.
- Communicate with students via a direct messaging system.

## Messaging System Frontend Logic

The messaging functionality is a key component of the dashboard and is the source of the current bug ("No active thread selected").

### UI Components
- **Message Center Modal (`messagesModal`):** The entire messaging interface is contained within a modal dialog.
- **Thread List (`.thread-list`):** A `<ul>` element on the left-hand side that displays all message threads (conversations).
  - Each thread is an `<li>` element with the class `.thread-item`.
  - Each thread element has a `data-thread-id` attribute containing the unique identifier for the conversation.
- **Conversation View (`.conversation-view`):** The main area on the right that displays the messages of the currently selected thread.
- **New Thread Button:** A button to initiate a new conversation with a student.

### Data Flow & Interaction
1.  **Opening the Modal:** When the teacher opens the message center, the application makes a `GET` request to the `/messages/:userId` endpoint on the server.
    -   `:userId` for a teacher is their full name (e.g., "Ms. Thompson").
2.  **Fetching Threads:** The server returns a JSON object containing an array of `thread` objects.
3.  **Rendering Threads:** The frontend's `displayMessageThreads` function iterates through the fetched threads and renders them into the `.thread-list`.
4.  **Thread Selection (The Problem Area):**
    -   A `click` event listener is supposed to be attached to each `.thread-item` element.
    -   When a teacher clicks on a thread, the following should happen:
        a. The clicked element gets an `active-thread` class.
        b. The `threadId` is retrieved from the element's `data-thread-id` attribute.
        c. A global state variable (e.g., `activeThreadId`) is updated with this ID.
        d. The `displayConversation` function is called with the `threadId` to render the corresponding messages.
5.  **Sending a Message:**
    -   When the teacher sends a message, a function (presumably `performSendMessage`) is called.
    -   This function checks for the `activeThreadId`.
    -   **The error "No active thread selected" occurs here**, indicating that the `activeThreadId` is not being set upon clicking a thread.
    -   If an active thread exists, a `sendMessage` event is emitted to the server via Socket.IO.

### Backend Endpoints & Socket Events
- **`GET /messages/:userId`**: Fetches all threads for the teacher.
- **`POST /newThread`**: Creates a new private conversation thread.
- **`socket.on('sendMessage', ...)`**: The server listens for this event to process and broadcast new messages.
- **`socket.on('newMessage', ...)`**: The client listens for this event to receive new messages in real-time and update the conversation view.
- **`socket.on('threadCreated', ...)`**: The client listens for this to add a new thread to the thread list in real-time.

## Root Cause of the Bug

The bug lies in the frontend code responsible for handling clicks on the thread list. The event listeners are either not being attached correctly, or the handler function is failing to update the application's state to reflect which thread is currently active. The backend appears to be supplying the necessary data, but the frontend is not using it correctly to manage the UI state.
