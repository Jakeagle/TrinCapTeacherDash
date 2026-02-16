# Lesson Creation Module (LCM)

## Overview

The **Lesson Creation Module (LCM)** handles all aspects of creating and editing lessons in the teacher dashboard. It provides a robust event-driven system for capturing user input, validating data, and preparing lesson payloads for server submission.

## Architecture

```
LCME/
└── LCM/
    ├── README.md                      (this file)
    ├── lessonCreationListeners.js     (Event listeners & data collection)
    └── [future files]                 (UI renderer, validators, etc.)
```

---

## Features

### ✅ Complete Event System

- **12 Custom Events** dispatched for UI updates
- **Event delegation** for dynamic content
- **Real-time validation** feedback
- **Unsaved changes** detection

### ✅ State Management

- Centralized lesson creation state
- Tracks lesson blocks, intro blocks, and objectives
- Dirty state tracking for unsaved changes
- Validation error tracking

### ✅ Content Management

- **Lesson Blocks**: Add, delete, reorder, duplicate, change type
- **Intro Blocks**: Add, delete, reorder
- **Learning Objectives**: Add, delete, edit
- **Basic Info**: Title, description, unit, time, difficulty

### ✅ Data Collection & Validation

- Comprehensive data collection from all fields
- Multi-level validation (required fields, content checks)
- Detailed error reporting
- Ready-to-submit payload generation

---

## Usage

### 1. Initialize Listeners

Call when opening the lesson creation modal:

```javascript
import { initializeLessonCreationListeners } from "./LCME/LCM/lessonCreationListeners.js";

// When modal opens
function openLessonCreationModal() {
  // Show your modal UI
  showModal();

  // Initialize all listeners
  initializeLessonCreationListeners();
}
```

### 2. Listen for Events

The module dispatches custom events that you handle in your UI code:

```javascript
// Listen for validation failures
window.addEventListener("lcm:validationFailed", (event) => {
  const { errors } = event.detail;
  displayValidationErrors(errors);
});

// Listen for save requests
window.addEventListener("lcm:saveRequested", async (event) => {
  const { lessonData, closeAfterSave } = event.detail;

  // Send to server
  const result = await saveLessonToServer(lessonData);

  if (result.success && closeAfterSave) {
    closeLessonCreationModal();
  }
});

// Listen for block additions
window.addEventListener("lcm:blockAdded", (event) => {
  const { block } = event.detail;
  renderLessonBlockInUI(block);
});

// Listen for block deletions
window.addEventListener("lcm:blockDeleted", (event) => {
  const { blockId } = event.detail;
  removeBlockFromUI(blockId);
});

// Listen for cancel requests
window.addEventListener("lcm:cancelRequested", (event) => {
  closeLessonCreationModal();
});
```

### 3. Cleanup

Call when closing the modal:

```javascript
import {
  cleanupLessonCreationListeners,
  resetLessonCreationState,
} from "./LCME/LCM/lessonCreationListeners.js";

function closeLessonCreationModal() {
  cleanupLessonCreationListeners();
  resetLessonCreationState();
  hideModal();
}
```

### 4. Load Existing Lesson (For Editing)

```javascript
import { loadExistingLessonData } from './LCME/LCM/lessonCreationListeners.js';

function editLesson(lessonId) {
  // Fetch lesson from server
  const lessonData = await fetchLessonFromServer(lessonId);

  // Open modal
  openLessonCreationModal();

  // Load data into form
  loadExistingLessonData(lessonData);
}
```

---

## Custom Events Reference

### Form Events

| Event Name             | Detail Properties                | Description            |
| ---------------------- | -------------------------------- | ---------------------- |
| `lcm:titleChanged`     | `{ title }`                      | Lesson title changed   |
| `lcm:unitChanged`      | `{ unitValue }`                  | Unit selection changed |
| `lcm:validationFailed` | `{ errors: Array }`              | Validation failed      |
| `lcm:saveRequested`    | `{ lessonData, closeAfterSave }` | Save button clicked    |
| `lcm:previewRequested` | `{ lessonData }`                 | Preview button clicked |
| `lcm:cancelRequested`  | `{ hadUnsavedChanges }`          | Cancel/close requested |

### Lesson Block Events

| Event Name             | Detail Properties               | Description            |
| ---------------------- | ------------------------------- | ---------------------- |
| `lcm:blockAdded`       | `{ block }`                     | New lesson block added |
| `lcm:blockDeleted`     | `{ blockId }`                   | Block deleted          |
| `lcm:blockMoved`       | `{ blockId, direction }`        | Block reordered        |
| `lcm:blockDuplicated`  | `{ originalBlockId, newBlock }` | Block duplicated       |
| `lcm:blockTypeChanged` | `{ blockId, newType }`          | Block type changed     |

### Intro Block Events

| Event Name              | Detail Properties        | Description           |
| ----------------------- | ------------------------ | --------------------- |
| `lcm:introBlockAdded`   | `{ block }`              | Intro block added     |
| `lcm:introBlockDeleted` | `{ blockId }`            | Intro block deleted   |
| `lcm:introBlockMoved`   | `{ blockId, direction }` | Intro block reordered |

### Learning Objective Events

| Event Name             | Detail Properties | Description              |
| ---------------------- | ----------------- | ------------------------ |
| `lcm:objectiveAdded`   | `{ objective }`   | Learning objective added |
| `lcm:objectiveDeleted` | `{ objectiveId }` | Objective deleted        |

---

## Required HTML Elements

Your lesson creation modal must include these IDs:

### Basic Info Fields

```html
<input type="text" id="lessonTitle" placeholder="Lesson Title" />
<textarea id="lessonDescription" placeholder="Lesson Description"></textarea>
<select id="lessonUnitSelector">
  <option value="unit1">Unit 1</option>
</select>
<input type="text" id="estimatedTime" placeholder="e.g., 45 minutes" />
<select id="difficultyLevel">
  <option value="easy">Easy</option>
  <option value="medium">Medium</option>
  <option value="hard">Hard</option>
</select>
```

### Containers for Dynamic Content

```html
<div id="lessonBlocksContainer">
  <!-- Lesson blocks rendered here -->
</div>

<div id="introBlocksContainer">
  <!-- Intro blocks rendered here -->
</div>

<div id="learningObjectivesContainer">
  <!-- Learning objectives rendered here -->
</div>
```

### Action Buttons

```html
<button id="addLessonBlockBtn">Add Lesson Block</button>
<button id="addIntroBlockBtn">Add Intro Text Block</button>
<button id="addLearningObjectiveBtn">Add Learning Objective</button>

<button id="saveLessonBtn">Save Lesson</button>
<button id="saveAndCloseLessonBtn">Save & Close</button>
<button id="previewLessonBtn">Preview</button>
<button id="cancelLessonCreationBtn">Cancel</button>
<button id="closeLessonCreationModal">×</button>
```

### Dynamic Block Elements

Lesson blocks must have:

```html
<div data-block-id="block_123">
  <select class="block-type-selector">
    <option value="text">Text</option>
    <option value="image">Image</option>
    <option value="video">Video</option>
  </select>

  <textarea data-field="content"></textarea>

  <button class="move-block-up-btn">↑</button>
  <button class="move-block-down-btn">↓</button>
  <button class="duplicate-block-btn">Duplicate</button>
  <button class="delete-block-btn">Delete</button>
</div>
```

Intro blocks must have:

```html
<div data-intro-block-id="intro_123">
  <textarea></textarea>
  <button class="move-intro-up-btn">↑</button>
  <button class="move-intro-down-btn">↓</button>
  <button class="delete-intro-block-btn">Delete</button>
</div>
```

Learning objectives must have:

```html
<div data-objective-id="objective_123">
  <input type="text" />
  <button class="delete-objective-btn">Delete</button>
</div>
```

---

## Data Structure

### Lesson Data Object

When you call `collectLessonData()`, you get:

```javascript
{
  lesson_title: "Introduction to Banking",
  lesson_description: "Learn the basics of banking...",
  unit: "unit1",
  estimated_time: "45 minutes",
  difficulty: "medium",
  teacher: "teacher@example.com",

  lesson_blocks: [
    {
      id: "block_1234567890",
      type: "text",
      content: "Welcome to this lesson...",
      order: 0,
      createdAt: "2026-02-15T10:30:00.000Z"
    },
    {
      id: "block_1234567891",
      type: "image",
      content: "https://example.com/image.jpg",
      order: 1,
      createdAt: "2026-02-15T10:31:00.000Z"
    }
  ],

  intro_text_blocks: [
    {
      content: "In this lesson, you will learn...",
      order: 0
    }
  ],

  learning_objectives: [
    "Understand basic banking concepts",
    "Identify different types of bank accounts"
  ],

  created_at: "2026-02-15T10:25:00.000Z",
  updated_at: "2026-02-15T10:35:00.000Z",
  version: 1
}
```

### State Object

Access with `getLessonCreationState()`:

```javascript
{
  isInitialized: true,
  currentLesson: { /* lesson data if editing */ },
  lessonBlocks: [ /* array of block objects */ ],
  introTextBlocks: [ /* array of intro blocks */ ],
  learningObjectives: [ /* array of objectives */ ],
  isDirty: true, // Has unsaved changes
  validationErrors: [
    { field: "lesson_title", message: "Lesson title is required" }
  ]
}
```

---

## Validation Rules

### Required Fields

- ✅ `lesson_title` - Must be 3-100 characters
- ✅ `unit` - Must select a unit
- ✅ `teacher` - Must have active teacher

### Content Requirements

- ✅ At least one lesson block required
- ✅ All lesson blocks must have content
- ✅ Empty blocks flagged as errors

### Custom Validation

You can add additional validation by listening to events:

```javascript
window.addEventListener("lcm:saveRequested", (event) => {
  const { lessonData } = event.detail;

  // Custom validation
  if (lessonData.lesson_blocks.length > 50) {
    alert("Too many blocks! Maximum is 50.");
    event.preventDefault();
    return;
  }

  // Proceed with save...
});
```

---

## Example: Complete Integration

```javascript
// script.js

import {
  initializeLessonCreationListeners,
  cleanupLessonCreationListeners,
  resetLessonCreationState,
  loadExistingLessonData,
  collectLessonData,
  getLessonCreationState,
} from "./LCME/LCM/lessonCreationListeners.js";

// Open lesson creation modal
document.getElementById("createLessonBtn").addEventListener("click", () => {
  openLessonCreationModal();
});

function openLessonCreationModal() {
  // Show modal
  const modal = document.getElementById("lessonCreationModal");
  modal.showModal();

  // Initialize listeners
  initializeLessonCreationListeners();

  console.log("Lesson creation modal opened");
}

// Handle save requests
window.addEventListener("lcm:saveRequested", async (event) => {
  const { lessonData, closeAfterSave } = event.detail;

  showLoadingSpinner("Saving lesson...");

  try {
    // Send to server
    const response = await fetch("http://localhost:4000/api/lessons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lessonData),
    });

    const result = await response.json();

    if (result.success) {
      showNotification("✅ Lesson saved successfully!", "success");

      // Refresh lessons list
      await loadTeacherLessons(window.activeTeacherName);

      if (closeAfterSave) {
        closeLessonCreationModal();
      } else {
        // Mark as clean (no unsaved changes)
        const state = getLessonCreationState();
        state.isDirty = false;
      }
    } else {
      showNotification("❌ Failed to save lesson", "error");
    }
  } catch (error) {
    console.error("Save error:", error);
    showNotification("❌ Error saving lesson", "error");
  } finally {
    hideLoadingSpinner();
  }
});

// Handle validation failures
window.addEventListener("lcm:validationFailed", (event) => {
  const { errors } = event.detail;

  // Display errors in UI
  const errorContainer = document.getElementById("validationErrors");
  errorContainer.innerHTML = errors
    .map((err) => `<div class="error-message">${err.message}</div>`)
    .join("");

  showNotification("⚠️ Please fix validation errors", "warning");
});

// Handle block additions
window.addEventListener("lcm:blockAdded", (event) => {
  const { block } = event.detail;
  renderLessonBlock(block);
});

function renderLessonBlock(block) {
  const container = document.getElementById("lessonBlocksContainer");

  const blockHTML = `
    <div class="lesson-block" data-block-id="${block.id}">
      <div class="block-header">
        <select class="block-type-selector">
          <option value="text">Text</option>
          <option value="image">Image</option>
          <option value="video">Video</option>
          <option value="activity">Activity</option>
        </select>
        
        <div class="block-actions">
          <button class="move-block-up-btn">↑</button>
          <button class="move-block-down-btn">↓</button>
          <button class="duplicate-block-btn">📋</button>
          <button class="delete-block-btn">🗑️</button>
        </div>
      </div>
      
      <textarea 
        data-field="content" 
        placeholder="Enter block content..."
        rows="5"
      ></textarea>
    </div>
  `;

  container.insertAdjacentHTML("beforeend", blockHTML);
}

// Handle cancel
window.addEventListener("lcm:cancelRequested", () => {
  closeLessonCreationModal();
});

function closeLessonCreationModal() {
  cleanupLessonCreationListeners();
  resetLessonCreationState();

  const modal = document.getElementById("lessonCreationModal");
  modal.close();

  console.log("Lesson creation modal closed");
}

// Edit existing lesson
function editLesson(lessonId) {
  // Fetch lesson data
  fetch(`http://localhost:4000/api/lessons/${lessonId}`)
    .then((res) => res.json())
    .then((data) => {
      openLessonCreationModal();
      loadExistingLessonData(data.lesson);

      // Render all blocks
      data.lesson.lesson_blocks.forEach((block) => renderLessonBlock(block));
    });
}
```

---

## Best Practices

### ✅ DO:

- Initialize listeners when modal opens
- Cleanup listeners when modal closes
- Reset state between lesson creations
- Listen for validation events and display errors
- Use the collected data structure as-is for server submission
- Handle the `isDirty` flag to warn users about unsaved changes

### ❌ DON'T:

- Initialize multiple times without cleanup
- Directly manipulate internal state (use events)
- Skip validation before submission
- Forget to cleanup when closing modal
- Ignore validation error events

---

## Next Steps

1. **Create UI Renderer** - Build `lessonCreationUI.js` to dynamically generate the modal HTML
2. **Add Socket Support** - Create socket handlers in SIM for real-time lesson creation
3. **Create Server Endpoints** - Add lesson CRUD endpoints in lesson server
4. **Add Rich Text Editor** - Integrate WYSIWYG editor for block content
5. **Add File Upload** - Support image/video uploads for media blocks
6. **Add Preview** - Build lesson preview functionality

---

## Troubleshooting

### Events not firing

- Check that `initializeLessonCreationListeners()` was called
- Verify HTML elements have correct IDs
- Check browser console for errors

### Validation always failing

- Check `getLessonCreationState().validationErrors` for details
- Ensure required fields have values
- Verify at least one lesson block exists

### Dirty state not tracking

- Make sure you're using the provided input handlers
- Check that `isDirty` is toggled correctly
- Verify event handlers are attached to inputs

---

## API Reference

### Functions

| Function                              | Parameters   | Returns   | Description              |
| ------------------------------------- | ------------ | --------- | ------------------------ |
| `initializeLessonCreationListeners()` | None         | `void`    | Initialize all listeners |
| `cleanupLessonCreationListeners()`    | None         | `void`    | Remove all listeners     |
| `collectLessonData()`                 | None         | `Object`  | Get complete lesson data |
| `validateLessonData(data)`            | `lessonData` | `boolean` | Validate lesson data     |
| `loadExistingLessonData(data)`        | `lessonData` | `void`    | Load data for editing    |
| `getLessonCreationState()`            | None         | `Object`  | Get current state        |
| `resetLessonCreationState()`          | None         | `void`    | Reset state              |

---

## Support

For issues with the Lesson Creation Module:

1. Check console for `[LCM-Listeners]` logs
2. Verify all required HTML elements exist
3. Check state with `getLessonCreationState()`
4. Review validation errors in state
