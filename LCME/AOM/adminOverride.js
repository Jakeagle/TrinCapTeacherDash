/**
 * ============================================================================
 * ADMIN OVERRIDE MODULE (AOM)
 * ============================================================================
 *
 * Purpose: Manages the admin lesson/unit override system for teachers
 *
 * Core Functionality:
 * - Detects if a teacher has their own units
 * - Populates admin lessons when teacher has no units
 * - Provides read-only admin lesson viewing
 * - Enables copying admin units to teacher's account
 *
 * MongoDB Schema References:
 * - Teachers Collection: { name, units: [{ value, name, lessons: [{ _id, lesson_title, lesson_description }] }] }
 * - Lessons Collection: { _id, teacher, unit, lesson_title, content, lesson_blocks, intro_text_blocks }
 *
 * @module AdminOverrideModule
 */

// Admin account identifier
const ADMIN_ACCOUNT = "admin@trinity-capital.net";

// API Configuration
const API_CONFIG = {
  lessonServer: "http://localhost:4000",
  mainServer: "http://localhost:3000",
};

/**
 * Checks if a teacher has any units in their account
 * @param {string} teacherName - Teacher's email/name
 * @returns {Promise<boolean>} - True if teacher has units, false otherwise
 */
export async function hasOwnUnits(teacherName) {
  try {
    const response = await fetch(
      `${API_CONFIG.lessonServer}/api/teacher/units?teacherName=${encodeURIComponent(teacherName)}`,
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch teacher units: ${response.statusText}`);
    }

    const data = await response.json();
    return data.units && data.units.length > 0;
  } catch (error) {
    console.error("Error checking teacher units:", error);
    throw error;
  }
}

/**
 * Fetches units from a specific teacher (usually admin)
 * @param {string} teacherName - Teacher's email/name
 * @returns {Promise<Array>} - Array of unit objects with lesson references
 */
export async function fetchTeacherUnits(teacherName) {
  try {
    const response = await fetch(
      `${API_CONFIG.lessonServer}/api/teacher/units?teacherName=${encodeURIComponent(teacherName)}`,
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch units for ${teacherName}: ${response.statusText}`,
      );
    }

    const data = await response.json();
    return data.units || [];
  } catch (error) {
    console.error(`Error fetching units for ${teacherName}:`, error);
    throw error;
  }
}

/**
 * Fetches full lesson content by lesson ID
 * @param {string} lessonId - The lesson ID
 * @returns {Promise<Object>} - Complete lesson object with content, blocks, etc.
 */
export async function fetchLessonContent(lessonId) {
  try {
    const response = await fetch(
      `${API_CONFIG.lessonServer}/lesson/${lessonId}`,
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch lesson ${lessonId}: ${response.statusText}`,
      );
    }

    const data = await response.json();
    return data.lesson || data;
  } catch (error) {
    console.error(`Error fetching lesson content for ${lessonId}:`, error);
    throw error;
  }
}

/**
 * Fetches multiple lessons by their IDs in batch
 * @param {Array<string>} lessonIds - Array of lesson IDs
 * @returns {Promise<Array>} - Array of complete lesson objects
 */
export async function fetchLessonsBatch(lessonIds) {
  try {
    const lessonPromises = lessonIds.map((id) => fetchLessonContent(id));
    const lessons = await Promise.all(lessonPromises);
    return lessons;
  } catch (error) {
    console.error("Error fetching lessons in batch:", error);
    throw error;
  }
}

/**
 * Enriches unit objects with full lesson content
 * @param {Array} units - Array of units with lesson references
 * @returns {Promise<Array>} - Units with fully populated lesson objects
 */
export async function enrichUnitsWithLessonContent(units) {
  try {
    const enrichedUnits = [];

    for (const unit of units) {
      const enrichedUnit = { ...unit };

      if (unit.lessons && unit.lessons.length > 0) {
        // Extract lesson IDs
        const lessonIds = unit.lessons.map((lesson) => lesson._id);

        // Fetch full lesson content
        const fullLessons = await fetchLessonsBatch(lessonIds);

        // Replace lesson references with full content
        enrichedUnit.lessons = fullLessons;
      }

      enrichedUnits.push(enrichedUnit);
    }

    return enrichedUnits;
  } catch (error) {
    console.error("Error enriching units with lesson content:", error);
    throw error;
  }
}

/**
 * Gets the appropriate units for a teacher (their own or admin's)
 * @param {string} teacherName - Teacher's email/name
 * @returns {Promise<Object>} - { units: Array, isAdminOverride: boolean, isReadOnly: boolean }
 */
export async function getTeacherUnitsWithOverride(teacherName) {
  try {
    // Check if teacher has their own units
    const teacherHasUnits = await hasOwnUnits(teacherName);

    if (teacherHasUnits) {
      // Teacher has units - fetch and return them
      const units = await fetchTeacherUnits(teacherName);
      const enrichedUnits = await enrichUnitsWithLessonContent(units);

      return {
        units: enrichedUnits,
        isAdminOverride: false,
        isReadOnly: false,
        source: teacherName,
      };
    } else {
      // Teacher has no units - fetch admin units
      const adminUnits = await fetchTeacherUnits(ADMIN_ACCOUNT);
      const enrichedUnits = await enrichUnitsWithLessonContent(adminUnits);

      // Mark units as admin-owned (read-only)
      const markedUnits = enrichedUnits.map((unit) => ({
        ...unit,
        isAdminUnit: true,
        originalOwner: ADMIN_ACCOUNT,
      }));

      return {
        units: markedUnits,
        isAdminOverride: true,
        isReadOnly: teacherName !== ADMIN_ACCOUNT,
        source: ADMIN_ACCOUNT,
        canCopy: teacherName !== ADMIN_ACCOUNT,
      };
    }
  } catch (error) {
    console.error("Error getting teacher units with override:", error);
    throw error;
  }
}

/**
 * Copies an admin unit to a teacher's account
 * @param {string} teacherName - Teacher's email/name
 * @param {Object} unit - The unit object to copy
 * @returns {Promise<Object>} - Result of the copy operation
 */
export async function copyAdminUnitToTeacher(teacherName, unit) {
  try {
    // Validate inputs
    if (!teacherName || teacherName === ADMIN_ACCOUNT) {
      throw new Error("Invalid teacher name for copying");
    }

    if (!unit || !unit.value) {
      throw new Error("Invalid unit object for copying");
    }

    // Prepare unit data for copying
    const unitToCopy = {
      value: unit.value,
      name: unit.name,
      lessons: unit.lessons.map((lesson) => ({
        _id: lesson._id,
        lesson_title: lesson.lesson_title,
        lesson_description: lesson.lesson_description,
      })),
    };

    // Send copy request to lesson server
    const response = await fetch(
      `${API_CONFIG.lessonServer}/api/teacher/copy-unit`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          teacherName: teacherName,
          unit: unitToCopy,
          sourceTeacher: ADMIN_ACCOUNT,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to copy unit");
    }

    const result = await response.json();

    console.log(`Successfully copied unit "${unit.name}" to ${teacherName}`);

    return {
      success: true,
      message: `Unit "${unit.name}" has been copied to your account`,
      copiedUnit: result.unit,
    };
  } catch (error) {
    console.error("Error copying admin unit to teacher:", error);
    return {
      success: false,
      message: error.message || "Failed to copy unit",
    };
  }
}

/**
 * Copies all admin units to a teacher's account
 * @param {string} teacherName - Teacher's email/name
 * @returns {Promise<Object>} - Result with count of copied units
 */
export async function copyAllAdminUnitsToTeacher(teacherName) {
  try {
    const adminUnits = await fetchTeacherUnits(ADMIN_ACCOUNT);

    const copyResults = [];
    for (const unit of adminUnits) {
      const result = await copyAdminUnitToTeacher(teacherName, unit);
      copyResults.push(result);
    }

    const successCount = copyResults.filter((r) => r.success).length;

    return {
      success: successCount > 0,
      message: `Copied ${successCount} of ${adminUnits.length} units`,
      copiedCount: successCount,
      totalCount: adminUnits.length,
      results: copyResults,
    };
  } catch (error) {
    console.error("Error copying all admin units:", error);
    return {
      success: false,
      message: error.message || "Failed to copy units",
    };
  }
}

/**
 * Validates if current user is admin
 * @param {string} teacherName - Teacher's email/name
 * @returns {boolean} - True if admin, false otherwise
 */
export function isAdminAccount(teacherName) {
  return teacherName === ADMIN_ACCOUNT;
}

// Export configuration for external use
export const config = {
  ADMIN_ACCOUNT,
  API_CONFIG,
};
