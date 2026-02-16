// ====================================================================
// CLASS HEALTH CALCULATION SYSTEM
// ====================================================================

// API Configuration - Automatically switch between production and local
const isLocalEnvironment = 
  window.location.hostname === 'localhost' || 
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname.includes('127.0.0.1');

const API_BASE_URL = isLocalEnvironment
  ? "http://localhost:3000"
  : "https://tcstudentserver-production.up.railway.app";

/**
 * Calculates individual student financial health score
 * @param {Object} studentData - Student's financial data
 * @param {number} studentData.grade - Student's current grade (0-100)
 * @param {number} studentData.checkingBalance - Current checking account balance
 * @param {number} studentData.savingsBalance - Current savings account balance
 * @param {Array} studentData.bills - Array of monthly bills/expenses
 * @param {Array} studentData.income - Array of monthly income sources
 * @param {number} studentData.debt - Total debt amount (loans, etc.)
 * @returns {Object} Health score breakdown and overall score
 */
function calculateStudentHealth(studentData) {
  const {
    completedLessons = 0,
    checkingBalance = 0,
    savingsBalance = 0,
    bills = [],
    income = [],
    debt = 0,
  } = studentData;

  // Calculate monthly totals
  const monthlyBills = bills.reduce((total, bill) => {
    const monthlyAmount = convertToMonthlyAmount(
      Math.abs(bill.amount),
      bill.interval,
    );
    return total + monthlyAmount;
  }, 0);

  const monthlyIncome = income.reduce((total, incomeSource) => {
    const monthlyAmount = convertToMonthlyAmount(
      Math.abs(incomeSource.amount),
      incomeSource.interval,
    );
    return total + monthlyAmount;
  }, 0);

  // Health Factor Calculations
  const healthFactors = {
    grade: calculateGradeHealth(completedLessons),
    checkingBalance: calculateCheckingBalanceHealth(
      checkingBalance,
      monthlyBills,
    ),
    savingsBalance: calculateSavingsBalanceHealth(savingsBalance, monthlyBills),
    checking: calculateCheckingHealth(checkingBalance, monthlyBills),
    savings: calculateSavingsHealth(savingsBalance, monthlyBills),
    incomeRatio: calculateIncomeRatioHealth(monthlyIncome, monthlyBills),
    emergencyFund: calculateEmergencyFundHealth(savingsBalance, monthlyBills),
    debt: calculateDebtHealth(debt, monthlyIncome),
  };

  // Weight Distribution (totaling 100%)
  const weights = {
    grade: 0.25, // 25% - Student academic performance
    checkingBalance: 0.2, // 20% - Checking account balance health
    savingsBalance: 0.2, // 20% - Savings account balance health
    checking: 0.1, // 10% - Bill payment capability (when bills exist)
    savings: 0.0, // 0% - Replaced by savingsBalance
    incomeRatio: 0.15, // 15% - Income vs spending ratio
    emergencyFund: 0.0, // 0% - Replaced by savingsBalance
    debt: 0.1, // 10% - Debt burden
  };

  // Calculate weighted overall health score
  const overallHealth = Object.keys(healthFactors).reduce((total, factor) => {
    return total + healthFactors[factor] * weights[factor];
  }, 0);

  return {
    overallHealth: Math.round(overallHealth),
    factors: healthFactors,
    weights: weights,
    financialData: {
      monthlyBills,
      monthlyIncome,
      totalBalance: checkingBalance + savingsBalance,
      netWorth: checkingBalance + savingsBalance - debt,
    },
  };
}

/**
 * Calculate grade-based health based on completed lessons (50% of overall health)
 * @param {number} completedLessons - Number of lessons completed
 * @returns {number} Health score (0-100)
 */
function calculateGradeHealth(completedLessons) {
  // Map completed lessons to a health score
  // Assuming a reasonable student completes 10-15 lessons for 100%
  const maxLessons = 15; // Adjust based on your curriculum
  const healthScore = (completedLessons / maxLessons) * 100;
  return Math.max(0, Math.min(100, healthScore));
}

/**
 * Calculate checking account balance health independently
 * BASE: 1.5x monthly expenses
 * BEST: Covers all expenses + 10% buffer
 * @param {number} checkingBalance - Current checking balance
 * @param {number} monthlyBills - Total monthly bills/expenses
 * @returns {number} Health score (0-100)
 */
function calculateCheckingBalanceHealth(checkingBalance, monthlyBills) {
  // If no bills/expenses exist, evaluate based on absolute balance
  if (monthlyBills === 0) {
    // Scale: $0 = 0%, $5000 = 100%
    const baseAmount = 5000;
    return Math.max(0, Math.min(100, (checkingBalance / baseAmount) * 100));
  }

  const baseThreshold = monthlyBills * 1.5; // BASE: 1.5x expenses
  const bestThreshold = monthlyBills * 1.1; // BEST: expenses + 10% buffer

  if (checkingBalance >= bestThreshold) return 100; // Perfect - covers all + buffer
  if (checkingBalance >= monthlyBills) return 75; // Good - covers all expenses
  if (checkingBalance >= baseThreshold * 0.5) return 50; // Fair - covers some
  return Math.max(0, (checkingBalance / (monthlyBills * 0.5)) * 50); // Linear scale
}

/**
 * Calculate savings account balance health independently
 * BASE: 1 month of expenses
 * BEST: 6 months of expenses
 * @param {number} savingsBalance - Current savings balance
 * @param {number} monthlyBills - Total monthly bills/expenses
 * @returns {number} Health score (0-100)
 */
function calculateSavingsBalanceHealth(savingsBalance, monthlyBills) {
  // If no bills/expenses exist, evaluate based on absolute balance
  if (monthlyBills === 0) {
    // Scale: $0 = 0%, $10000 = 100%
    const baseAmount = 10000;
    return Math.max(0, Math.min(100, (savingsBalance / baseAmount) * 100));
  }

  const baseThreshold = monthlyBills * 1; // BASE: 1 month
  const bestThreshold = monthlyBills * 6; // BEST: 6 months

  if (savingsBalance >= bestThreshold) return 100; // Perfect - 6 months emergency fund
  if (savingsBalance >= monthlyBills * 3) return 85; // Excellent - 3 months
  if (savingsBalance >= monthlyBills * 1) return 70; // Good - 1 month
  if (savingsBalance >= monthlyBills * 0.5) return 40; // Fair - 2 weeks
  return Math.max(0, (savingsBalance / (monthlyBills * 0.5)) * 40); // Linear scale
}

/**
 * Calculate checking account health based on bill payment capability
 * @param {number} checkingBalance - Current checking balance
 * @param {number} monthlyBills - Total monthly bills
 * @returns {number} Health score (0-100)
 */
function calculateCheckingHealth(checkingBalance, monthlyBills) {
  // If no bills exist, this metric shouldn't count as healthy
  // A student with no bills and no money has nothing to evaluate
  if (monthlyBills === 0) return 0; // No bills = no data to evaluate

  const billCoverageRatio = checkingBalance / monthlyBills;

  if (billCoverageRatio >= 1.0) return 100; // Can pay all bills at once
  if (billCoverageRatio >= 0.75) return 85; // Can cover 75% of bills
  if (billCoverageRatio >= 0.5) return 70; // Can cover 50% of bills
  if (billCoverageRatio >= 0.25) return 50; // Can cover 25% of bills
  return Math.max(0, billCoverageRatio * 100); // Linear scale below 25%
}

/**
 * Calculate savings health based on 3-month expense coverage
 * @param {number} savingsBalance - Current savings balance
 * @param {number} monthlyBills - Total monthly expenses
 * @returns {number} Health score (0-100)
 */
function calculateSavingsHealth(savingsBalance, monthlyBills) {
  // No bills = can't evaluate savings health yet
  if (monthlyBills === 0) return 0;

  const monthsCovered = savingsBalance / monthlyBills;

  if (monthsCovered >= 3.0) return 100; // 3+ months = perfect
  if (monthsCovered >= 2.0) return 85; // 2-3 months = good
  if (monthsCovered >= 1.0) return 70; // 1-2 months = fair
  if (monthsCovered >= 0.5) return 50; // 0.5-1 month = poor
  return Math.max(0, (monthsCovered / 3) * 100); // Linear scale
}

/**
 * Calculate income-to-spending ratio health
 * BASE: Breaking even + 10% (1.1x expenses)
 * BEST: 1.5-2x expenses (perfect)
 * @param {number} monthlyIncome - Total monthly income
 * @param {number} monthlyBills - Total monthly expenses
 * @returns {number} Health score (0-100)
 */
function calculateIncomeRatioHealth(monthlyIncome, monthlyBills) {
  if (monthlyBills === 0) return monthlyIncome > 0 ? 100 : 0;
  if (monthlyIncome === 0) return 0;

  const incomeRatio = monthlyIncome / monthlyBills;

  if (incomeRatio >= 2.0) return 100; // 2x or more = perfect
  if (incomeRatio >= 1.75) return 90; // 1.75x = excellent
  if (incomeRatio >= 1.5) return 80; // 1.5x = very good
  if (incomeRatio >= 1.25) return 60; // 1.25x = fair
  if (incomeRatio >= 1.1) return 50; // 1.1x (break-even + 10%) = passing
  if (incomeRatio >= 1.0) return 25; // Break-even = poor
  return Math.max(0, (incomeRatio / 1.1) * 25); // Linear scale below break-even
}

/**
 * Calculate emergency fund health (6-month coverage)
 * @param {number} savingsBalance - Current savings balance
 * @param {number} monthlyBills - Total monthly expenses
 * @returns {number} Health score (0-100)
 */
function calculateEmergencyFundHealth(savingsBalance, monthlyBills) {
  // No bills = can't evaluate emergency fund yet
  if (monthlyBills === 0) return 0;

  const monthsCovered = savingsBalance / monthlyBills;

  if (monthsCovered >= 6.0) return 100; // 6+ months = perfect emergency fund
  if (monthsCovered >= 4.0) return 85; // 4-6 months = good
  if (monthsCovered >= 3.0) return 70; // 3-4 months = fair
  if (monthsCovered >= 1.0) return 50; // 1-3 months = minimal
  return Math.max(0, (monthsCovered / 6) * 100); // Linear scale
}

/**
 * Calculate debt health (0 debt = perfect health)
 * @param {number} debt - Total debt amount
 * @param {number} monthlyIncome - Total monthly income
 * @returns {number} Health score (0-100)
 */
function calculateDebtHealth(debt, monthlyIncome) {
  if (debt <= 0) return 100; // No debt = perfect health
  if (monthlyIncome <= 0) return 0; // No income with debt = critical

  const debtToIncomeRatio = debt / (monthlyIncome * 12); // Annual debt-to-income

  if (debtToIncomeRatio <= 0.1) return 90; // 10% or less = excellent
  if (debtToIncomeRatio <= 0.2) return 80; // 20% or less = good
  if (debtToIncomeRatio <= 0.3) return 65; // 30% or less = fair
  if (debtToIncomeRatio <= 0.5) return 45; // 50% or less = concerning
  if (debtToIncomeRatio <= 1.0) return 25; // 100% or less = poor
  return Math.max(0, 100 - debtToIncomeRatio * 50); // Severe penalty for high debt
}

/**
 * Convert different frequency amounts to monthly amounts
 * @param {number} amount - The amount
 * @param {string} frequency - 'weekly', 'bi-weekly', 'monthly', 'yearly'
 * @returns {number} Monthly amount
 */
function convertToMonthlyAmount(amount, frequency) {
  switch (frequency?.toLowerCase()) {
    case "weekly":
      return amount * 4; // Weekly * 4 = monthly
    case "bi-weekly":
      return amount * 2; // Bi-weekly * 2 = monthly
    case "monthly":
      return amount; // Already monthly
    case "yearly":
      return amount / 12; // Yearly / 12 = monthly
    default:
      return amount; // Assume monthly if not specified
  }
}

/**
 * Calculate overall class health from all students' health scores
 * @param {Array} studentsData - Array of student financial data
 * @returns {Object} Class health metrics and breakdown
 */
function calculateClassHealth(studentsData) {
  if (!studentsData || studentsData.length === 0) {
    return {
      overallClassHealth: 0,
      totalStudents: 0,
      healthDistribution: {
        excellent: 0,
        good: 0,
        fair: 0,
        poor: 0,
        critical: 0,
      },
      averageFactors: {},
      topPerformers: [],
      needsAttention: [],
    };
  }

  const studentHealthScores = studentsData.map((student) => {
    const health = calculateStudentHealth(student);
    return {
      ...student,
      health: health,
    };
  });

  // Calculate class averages
  const totalStudents = studentHealthScores.length;
  const overallClassHealth =
    studentHealthScores.reduce(
      (sum, student) => sum + student.health.overallHealth,
      0,
    ) / totalStudents;

  // Calculate average health factors
  const averageFactors = {};
  const factorKeys = Object.keys(studentHealthScores[0].health.factors);
  factorKeys.forEach((factor) => {
    averageFactors[factor] =
      studentHealthScores.reduce(
        (sum, student) => sum + student.health.factors[factor],
        0,
      ) / totalStudents;
  });

  // Health distribution
  const healthDistribution = {
    excellent: 0,
    good: 0,
    fair: 0,
    poor: 0,
    critical: 0,
  };
  studentHealthScores.forEach((student) => {
    const score = student.health.overallHealth;
    if (score >= 90) healthDistribution.excellent++;
    else if (score >= 80) healthDistribution.good++;
    else if (score >= 70) healthDistribution.fair++;
    else if (score >= 60) healthDistribution.poor++;
    else healthDistribution.critical++;
  });

  // Identify top performers and students needing attention
  const sortedByHealth = [...studentHealthScores].sort(
    (a, b) => b.health.overallHealth - a.health.overallHealth,
  );

  const topPerformers = sortedByHealth
    .slice(0, Math.min(5, Math.ceil(totalStudents * 0.2)))
    .map((student) => ({
      name: student.name || student.username,
      health: student.health.overallHealth,
      strongestFactor: getStrongestFactor(student.health.factors),
    }));

  const needsAttention = sortedByHealth
    .slice(-Math.min(5, Math.ceil(totalStudents * 0.2)))
    .reverse()
    .map((student) => ({
      name: student.name || student.username,
      health: student.health.overallHealth,
      weakestFactor: getWeakestFactor(student.health.factors),
      recommendations: generateRecommendations(student.health),
    }));

  return {
    overallClassHealth: Math.round(overallClassHealth),
    totalStudents,
    healthDistribution,
    averageFactors: Object.fromEntries(
      Object.entries(averageFactors).map(([key, value]) => [
        key,
        Math.round(value),
      ]),
    ),
    topPerformers,
    needsAttention,
    allStudentScores: studentHealthScores,
  };
}

/**
 * Get the strongest health factor for a student (excluding grade)
 * @param {Object} factors - Health factors object
 * @returns {string} Name of strongest financial factor
 */
function getStrongestFactor(factors) {
  // Exclude grade from consideration since it's expected in school setting
  const financialFactors = Object.entries(factors).filter(
    ([factor]) => factor !== "grade",
  );

  if (financialFactors.length === 0) return "checking"; // fallback

  return financialFactors.reduce(
    (strongest, [factor, score]) =>
      score > financialFactors.find(([f]) => f === strongest)[1]
        ? factor
        : strongest,
    financialFactors[0][0],
  );
}

/**
 * Get the weakest health factor for a student
 * @param {Object} factors - Health factors object
 * @returns {string} Name of weakest factor
 */
function getWeakestFactor(factors) {
  return Object.entries(factors).reduce(
    (weakest, [factor, score]) => (score < factors[weakest] ? factor : weakest),
    Object.keys(factors)[0],
  );
}

/**
 * Generate recommendations for improving student health
 * @param {Object} healthData - Student's health data
 * @returns {Array} Array of recommendation strings
 */
function generateRecommendations(healthData) {
  const recommendations = [];
  const { factors, financialData } = healthData;

  if (factors.grade < 70) {
    recommendations.push(
      "Focus on improving academic performance - it's 50% of financial health",
    );
  }

  if (factors.checking < 70) {
    recommendations.push(
      "Build checking account balance to cover monthly bills",
    );
  }

  if (factors.savings < 70) {
    recommendations.push("Work toward saving 3 months of expenses");
  }

  if (factors.incomeRatio < 70) {
    recommendations.push("Increase income sources or reduce monthly expenses");
  }

  if (factors.emergencyFund < 70) {
    recommendations.push("Build emergency fund to cover 6 months of expenses");
  }

  if (factors.debt < 70) {
    recommendations.push("Focus on reducing debt burden");
  }

  return recommendations;
}

/**
 * Get health status color and label based on score
 * @param {number} healthScore - Health score (0-100)
 * @returns {Object} Color and label for display
 */
function getHealthStatus(healthScore) {
  if (healthScore >= 90)
    return { color: "#4CAF50", label: "Excellent", icon: "🟢" };
  if (healthScore >= 80) return { color: "#8BC34A", label: "Good", icon: "🟡" };
  if (healthScore >= 70) return { color: "#FFC107", label: "Fair", icon: "🟠" };
  if (healthScore >= 60) return { color: "#FF9800", label: "Poor", icon: "🔴" };
  return { color: "#F44336", label: "Critical", icon: "🆘" };
}

/**
 * Fetch all student financial data for health calculation from User Profiles collection
 * @param {string} teacherUsername - The teacher's username to find their students
 * @returns {Promise<Array>} Array of student financial data
 */
async function fetchAllStudentFinancialData(teacherUsername) {
  try {
    console.log(`Fetching student data for teacher: ${teacherUsername}`);

    // Fetch students assigned to this teacher from User Profiles collection
    const response = await fetch(
      `${API_BASE_URL}/students/profiles/${teacherUsername}`,
    );
    if (!response.ok) {
      throw new Error(
        `Failed to fetch student profiles: ${response.status} ${response.statusText}`,
      );
    }

    const apiResponse = await response.json();
    console.log("API response:", apiResponse);

    if (!apiResponse.success || !apiResponse.students) {
      throw new Error("Invalid response format from API");
    }

    const studentProfiles = apiResponse.students;

    // Transform the student profiles into the format needed for health calculation
    const studentsData = studentProfiles.map((profile) => {
      // Extract bills from checkingAccount.bills
      const bills = profile.checkingAccount?.bills || [];

      // Extract income from checkingAccount.payments (payments are income sources)
      // and savingsAccount.payments if they exist
      const checkingPayments = profile.checkingAccount?.payments || [];
      const savingsPayments = profile.savingsAccount?.payments || [];
      const income = [...checkingPayments, ...savingsPayments];

      // Get completed lessons count
      const completedLessons = Array.isArray(profile.completedLessons)
        ? profile.completedLessons.length
        : 0;

      const studentData = {
        name:
          profile.memberName ||
          `${profile.firstName || ""} ${profile.lastName || ""}`.trim() ||
          profile.username,
        username: profile.username || profile.memberName,
        completedLessons: completedLessons,
        checkingBalance:
          profile.checkingAccount?.balanceTotal ||
          profile.checkingAccount?.balance ||
          0,
        savingsBalance:
          profile.savingsAccount?.balanceTotal ||
          profile.savingsAccount?.balance ||
          0,
        bills: bills,
        income: income,
        debt: parseFloat(profile.debt) || 0,
      };

      return studentData;
    });

    console.log(
      `Transformed ${studentsData.length} student profiles for health calculation`,
    );
    return studentsData;
  } catch (error) {
    console.error("Error fetching student financial data:", error);
    // Provide more user-friendly error message
    throw new Error(`Unable to load student data: ${error.message}`);
  }
}

/**
 * Display class health dashboard in the UI
 * @param {Array} studentsData - Array of student financial data
 */
async function displayClassHealthDashboard(studentsData) {
  const classHealth = calculateClassHealth(studentsData);
  const healthStatus = getHealthStatus(classHealth.overallClassHealth);

  const content = `
    <div class="class-health-dashboard" style="max-width: 100%; padding: 1rem; color: #fff;">
      <div class="health-header" style="text-align: center; margin-bottom: 2rem; padding: 1.5rem; background: linear-gradient(135deg, rgba(59, 10, 112, 0.8), rgba(0, 255, 204, 0.2)); border-radius: 15px; border: 1px solid rgba(0, 255, 204, 0.3);">
        <div class="overall-health" style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem;">
          <div class="health-score" style="font-size: 3rem; font-weight: 700; text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3); color: ${
            healthStatus.color
          };">
            ${healthStatus.icon} ${classHealth.overallClassHealth}%
          </div>
          <div class="health-label" style="font-size: 1.5rem; font-weight: 600;">${
            healthStatus.label
          } Class Health</div>
          <div class="student-count" style="font-size: 1rem; opacity: 0.8;">${
            classHealth.totalStudents
          } Students</div>
        </div>
      </div>

      <div class="health-metrics-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem;">
        <div class="health-distribution" style="background: rgba(59, 10, 112, 0.4); border-radius: 12px; padding: 1.5rem; border: 1px solid rgba(0, 255, 204, 0.2);">
          <h4 style="color: #00ffcc; margin-bottom: 1rem; font-weight: 600;">Health Distribution</h4>
          <div class="distribution-bars">
            ${Object.entries(classHealth.healthDistribution)
              .map(
                ([level, count]) => `
              <div class="distribution-item" style="display: grid; grid-template-columns: 80px 1fr 40px; align-items: center; gap: 1rem; margin-bottom: 0.8rem;">
                <span class="level-name" style="font-size: 0.9rem; font-weight: 500; text-transform: capitalize;">${
                  level.charAt(0).toUpperCase() + level.slice(1)
                }</span>
                <div class="level-bar" style="height: 20px; background: rgba(255, 255, 255, 0.1); border-radius: 10px; overflow: hidden; position: relative;">
                  <div class="level-fill" style="height: 100%; background: linear-gradient(90deg, #00ffcc, #3b0a70); width: ${
                    (count / classHealth.totalStudents) * 100
                  }%; border-radius: 10px;"></div>
                </div>
                <span class="level-count" style="font-weight: 600; text-align: center;">${count}</span>
              </div>
            `,
              )
              .join("")}
          </div>
        </div>

        <div class="average-factors" style="background: rgba(59, 10, 112, 0.4); border-radius: 12px; padding: 1.5rem; border: 1px solid rgba(0, 255, 204, 0.2);">
          <h4 style="color: #00ffcc; margin-bottom: 1rem; font-weight: 600;">Average Health Factors</h4>
          <div class="factors-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            ${Object.entries(classHealth.averageFactors)
              .map(([factor, score]) => {
                const factorStatus = getHealthStatus(score);
                const factorName =
                  {
                    grade: "Academic Grade",
                    checking: "Bill Coverage",
                    savings: "Basic Savings",
                    incomeRatio: "Income Ratio",
                    emergencyFund: "Emergency Fund",
                    debt: "Debt Health",
                  }[factor] || factor;

                return `
                <div class="factor-item" style="display: flex; flex-direction: column; gap: 0.3rem; padding: 0.8rem; background: rgba(0, 0, 0, 0.2); border-radius: 8px;">
                  <div class="factor-name" style="font-size: 0.9rem; opacity: 0.9;">${factorName}</div>
                  <div class="factor-score" style="font-size: 1.1rem; font-weight: 600; color: ${factorStatus.color};">
                    ${factorStatus.icon} ${score}%
                  </div>
                </div>
              `;
              })
              .join("")}
          </div>
        </div>
      </div>

      <div class="students-lists" style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem;">
        <div class="top-performers" style="background: rgba(59, 10, 112, 0.4); border-radius: 12px; padding: 1.5rem; border: 1px solid rgba(0, 255, 204, 0.2);">
          <h4 style="color: #4CAF50; margin-bottom: 1rem;">🏆 Top Performers</h4>
          <div class="student-list">
            ${classHealth.topPerformers
              .map((student) => {
                const status = getHealthStatus(student.health);
                return `
                <div style="padding: 1rem; background: rgba(0, 0, 0, 0.2); border-radius: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; margin-bottom: 1rem;">
                  <span style="font-weight: 600; margin-right: 1rem;">${student.name}</span>
                  <span style="font-weight: 600; margin-right: 1rem; color: ${status.color};">
                    ${status.icon} ${student.health}%
                  </span>
                  <span style="font-size: 0.85rem; opacity: 0.8; font-style: italic;">Strong: ${student.strongestFactor}</span>
                </div>
              `;
              })
              .join("")}
          </div>
        </div>

        <div class="needs-attention" style="background: rgba(59, 10, 112, 0.4); border-radius: 12px; padding: 1.5rem; border: 1px solid rgba(0, 255, 204, 0.2);">
          <h4 style="color: #FF9800; margin-bottom: 1rem;">⚠️ Needs Attention</h4>
          <div class="student-list">
            ${classHealth.needsAttention
              .map((student) => {
                const status = getHealthStatus(student.health);
                return `
                <div style="padding: 1rem; background: rgba(0, 0, 0, 0.2); border-radius: 8px; margin-bottom: 1rem;">
                  <div style="display: flex; align-items: center; width: 100%; margin-bottom: 0.5rem;">
                    <span style="font-weight: 600; margin-right: 1rem;">${
                      student.name
                    }</span>
                    <span style="font-weight: 600; margin-right: 1rem; color: ${
                      status.color
                    };">
                      ${status.icon} ${student.health}%
                    </span>
                    <span style="font-size: 0.85rem; opacity: 0.8; font-style: italic;">Weak: ${
                      student.weakestFactor
                    }</span>
                  </div>
                  <div style="width: 100%; font-size: 0.9rem;">
                    <strong>Recommendations:</strong>
                    <ul style="margin: 0.5rem 0 0 0; padding-left: 1.2rem;">
                      ${student.recommendations
                        .map(
                          (rec) =>
                            `<li style="margin-bottom: 0.3rem; opacity: 0.9;">${rec}</li>`,
                        )
                        .join("")}
                    </ul>
                  </div>
                </div>
              `;
              })
              .join("")}
          </div>
        </div>
      </div>

      <div class="health-actions" style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; padding: 1rem; background: rgba(0, 0, 0, 0.1); border-radius: 12px; border: 1px solid rgba(0, 255, 204, 0.2);">
        <button type="button" id="refreshHealthBtn" class="btn" style="padding: 0.8rem 1.5rem; border-radius: 8px; border: none; background: linear-gradient(135deg, #00ffcc, #3b0a70); color: #fff; font-weight: 600; cursor: pointer;">
          🔄 Refresh Health Data
        </button>
        <button type="button" id="exportHealthReportBtn" class="btn" style="padding: 0.8rem 1.5rem; border-radius: 8px; border: none; background: linear-gradient(135deg, #00ffcc, #3b0a70); color: #fff; font-weight: 600; cursor: pointer;">
          📊 Export Health Report
        </button>
        <button type="button" id="sendClassHealthMessageBtn" class="btn" style="padding: 0.8rem 1.5rem; border-radius: 8px; border: none; background: linear-gradient(135deg, #00ffcc, #3b0a70); color: #fff; font-weight: 600; cursor: pointer;">
          📧 Send Class Health Message
        </button>
      </div>
    </div>
  `;

  window.openGlobalDialog("Class Financial Health Dashboard", content);

  // Add event listeners for the health dashboard buttons
  document
    .getElementById("refreshHealthBtn")
    ?.addEventListener("click", async () => {
      // Reload student data and refresh dashboard
      const freshData = await fetchAllStudentFinancialData(
        window.activeTeacherUsername,
      );
      displayClassHealthDashboard(freshData);
    });

  document
    .getElementById("exportHealthReportBtn")
    ?.addEventListener("click", () => {
      exportHealthReport(classHealth);
    });

  document
    .getElementById("sendClassHealthMessageBtn")
    ?.addEventListener("click", () => {
      openClassHealthMessageDialog(classHealth);
    });
}

/**
 * Export health report as downloadable file
 * @param {Object} classHealth - Class health data
 */
function exportHealthReport(classHealth) {
  const report = {
    generatedAt: new Date().toISOString(),
    classHealth: classHealth,
    summary: {
      overallHealth: classHealth.overallClassHealth,
      totalStudents: classHealth.totalStudents,
      excellentStudents: classHealth.healthDistribution.excellent,
      studentsNeedingAttention: classHealth.needsAttention.length,
    },
  };

  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `class-health-report-${
    new Date().toISOString().split("T")[0]
  }.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Open dialog for sending class health message
 * @param {Object} classHealth - Class health data
 */
function openClassHealthMessageDialog(classHealth) {
  const healthStatus = getHealthStatus(classHealth.overallClassHealth);
  const message = `
Class Financial Health Update:

Overall Health: ${healthStatus.icon} ${classHealth.overallClassHealth}% (${healthStatus.label})
Total Students: ${classHealth.totalStudents}

Health Distribution:
• Excellent (90-100%): ${classHealth.healthDistribution.excellent} students
• Good (80-89%): ${classHealth.healthDistribution.good} students  
• Fair (70-79%): ${classHealth.healthDistribution.fair} students
• Poor (60-69%): ${classHealth.healthDistribution.poor} students
• Critical (<60%): ${classHealth.healthDistribution.critical} students

Students needing attention: ${classHealth.needsAttention.length}

Keep up the great work building your financial literacy skills!
  `.trim();

  window.openGlobalDialog(
    "Send Class Health Message",
    `Send a financial health update to all students:`,
    {
      recipient: "Entire Class",
      onSend: (messageContent) => {
        const finalMessage = messageContent || message;
        // Use the helper function from script.js
        if (typeof window.sendClassHealthMessage === "function") {
          window.sendClassHealthMessage(finalMessage);
        } else {
          console.error("sendClassHealthMessage helper function not available");
          window.closeGlobalDialog();
        }
      },
    },
  );
}

/**
 * Initialize class health system
 * @param {string} teacherUsername - The teacher's username
 */
async function initializeClassHealth(teacherUsername) {
  try {
    console.log("Initializing class health system for:", teacherUsername);
    const studentsData = await fetchAllStudentFinancialData(teacherUsername);
    await displayClassHealthDashboard(studentsData);
  } catch (error) {
    console.error("Error initializing class health:", error);
    window.openGlobalDialog(
      "Class Health Error",
      "Unable to load class health data. Please ensure students have profile data and try again.",
    );
  }
}

/**
 * Refresh class health dashboard (lighter weight than full initialization)
 * @param {string} teacherUsername - The teacher's username
 */
async function refreshClassHealthDashboard(teacherUsername) {
  try {
    console.log("Refreshing class health dashboard for:", teacherUsername);

    // Check if the class health dashboard is currently displayed
    const existingDashboard = document.querySelector(".class-health-dashboard");
    if (!existingDashboard) {
      console.log("No class health dashboard found, skipping refresh");
      return;
    }

    // Fetch fresh data and update the display
    const studentsData = await fetchAllStudentFinancialData(teacherUsername);
    await displayClassHealthDashboard(studentsData);

    console.log("Class health dashboard refreshed successfully");
  } catch (error) {
    console.error("Error refreshing class health dashboard:", error);
    // Don't show error dialog for refresh failures to avoid spamming the user
  }
}
