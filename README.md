# swp391-gr02-pbms-fe
# **PBMS PROJECT \- ENTERPRISE TEAM WORKING GUIDELINES**

### **PART 1: GIT BRANCHING STRATEGY**

We utilize a simplified **Git Flow** model tailored for agile development.  
**1\. Fixed Branches:**

* main: The production-ready branch containing 100% stable code for final grading/deployment. **Strictly NO direct commits or pushes to this branch.**  
* develop: The primary integration branch. All completed features are merged here for testing.

**2\. Feature Branches (Working Branches):**  
When starting a new task, developers must create a new branch branching off from develop.

* **Syntax:** \<branch-type\>/\<Task-ID\>-\<short-description\>  
* **Allowed Branch Types:**  
  * feature/...: For new features.  
  * fix/...: For bug fixes.  
  * refactor/...: For code refactoring (no functional changes).  
* **Examples:**  
  * ✅ feature/PBMS-01-login-ui  
  * ✅ fix/PBMS-20-barrier-not-opening  
  * ❌ my-test-branch, ❌ update-code (Meaningless names are prohibited).

### **PART 2: CONVENTIONAL COMMITS**

Commit messages are the project's diary. Reviewers must understand what was changed without reading the code.  
**1\. Mandatory Syntax:**  
Plaintext  
\<type\>(\<scope\>): \<Short description in English\>

**2\. Allowed \<type\> Tags:**

* feat: A new feature.  
* fix: A bug fix.  
* ui: UI/UX updates (CSS, Tailwind, layout changes).  
* refactor: Code changes that neither fix a bug nor add a feature.  
* docs: Documentation updates (README, Swagger).  
* chore: Maintenance tasks (updating dependencies in package.json or pom.xml).

**3\. Examples:**

* ✅ feat(auth): add google oauth2 login  
* ✅ fix(pricing): fix incorrect night shift fee calculation  
* ✅ ui(dashboard): change full zone warning color to solid red  
* ❌ fix bug, ❌ done with task (Vague messages are prohibited).

### **PART 3: PULL REQUEST (PR) & MERGE RULES**

These rules act as a firewall to protect the develop branch.

1. **No Direct Push:** Once work on a feature/... branch is complete, the developer must push the branch to GitHub and create a **Pull Request (PR)** targeting the develop branch.  
2. **Self-Resolve Conflicts:** Before creating a PR, the developer must pull the latest develop branch to their local machine and resolve any merge conflicts locally. Ensure the project builds and runs smoothly before requesting a review.  
3. **Mandatory Code Review:** A PR cannot be merged into develop unless it receives at least **1 Approval** from another team member. The Tech Lead (Member 1\) holds the final merge authority to control quality.

### **PART 4: CODING STANDARDS**

To ensure the codebase looks like it was written by a single entity, the following Naming Conventions apply:  
**1\. Backend (Java/Spring Boot):**

* **Classes / Interfaces:** PascalCase (e.g., ParkingSession, PricingEngine).  
* **Methods / Variables:** camelCase (e.g., calculateFee(), totalAmount).  
* **Constants:** UPPER\_SNAKE\_CASE (e.g., MAX\_PARKING\_CAPACITY \= 300).  
* **Language:** 100% English for all class names, variables, methods, and DB tables. Vietnamese is only allowed for UI display strings or API response messages.  
* **Boundaries:** Never expose Entity classes directly to the Controller. You must map them to DTO (Data Transfer Object) classes.

**2\. Frontend (React/Vite):**

* **Component Names (.tsx):** PascalCase (e.g., GateConsoleScreen.tsx, LiveKpiCard.tsx).  
* **Custom Hooks:** Must start with the use prefix (e.g., useGateStore.ts, useAuth.ts).  
* **Variables / Logic Methods:** camelCase (e.g., handleOpenBarrier(), isLoading).  
* **Reusability:** Any UI element (buttons, inputs, modals) used more than twice must be extracted into a separate component within the src/features/shared/components directory.

### **PART 5: DAILY ROUTINE**

1. **Morning:** Open terminal [![][image1]](https://www.codecogs.com/eqnedit.php?latex=%5Crightarrow#2) git checkout develop [![][image2]](https://www.codecogs.com/eqnedit.php?latex=%5Crightarrow#2) git pull origin develop (Always sync the latest team code before coding).  
2. **During Work:** Commit frequently. Once a small logical chunk is done (e.g., a form validation, a specific API endpoint), commit it. **Never accumulate 3 days of work into one giant commit.**  
3. **End of Day (EOD):** Even if the task is incomplete, commit using chore: WIP \- \<task name\> (Work In Progress) and push the branch to GitHub to prevent data loss due to hardware failure.

### **PART 6: CODE COMMENTING & DOCUMENTATION**

To guarantee code readability and ease of handover, all members must strictly follow these commenting rules:

#### **6.1. File Header Comments**

Every new source file (.java, .tsx, .ts) must start with a block comment at the very top. This acts as the "map" of the file.

* **Author:** Primary creator/maintainer.  
* **Description:** The specific role this file plays in the PBMS system.  
* **Dependencies:** Key external services, APIs, or repositories it interacts with.

**Example:**  
/\*\*  
 \* @Author: Nguyen Van A (Member 4\)  
 \* @Date: 2026-07-02  
 \* @Description: Controller managing barrier gate operations and LPR camera interactions.  
 \* Handles ParkingSession creation and triggers the PricingEngine.  
 \* @Dependencies:   
 \* \- VehicleRepository (Local)  
 \* \- PricingEngineService (Local)  
 \* \- LprCameraClient (External API: http://iot-simulator/api/scan)  
 \*/  
package com.pbms.modules.operation.controller;  
// ... code starts here

#### **6.2. Function/Method Comments (Pseudocode)**

Do **NOT** write code blindly. Before implementing complex logic (e.g., Pricing algorithms, Routing engines), you must write the **Pseudocode** outlining the logical steps inside the JavaDoc/JSDoc block right above the function declaration.  
**Example:**

/\*\*  
 \* @Function: calculateOverstayPenalty  
 \* @Description: Calculates the penalty fee for vehicles parked over 72 hours.  
 \* @Logic\_Steps:  
 \* 1\. Calculate duration \= checkoutTime \- checkinTime.  
 \* 2\. IF (duration \<= 72 hours) \-\> RETURN 0 (No penalty).  
 \* 3\. IF (duration \> 72 hours):  
 \*    3.1. Calculate exceeded days \= Math.ceil((duration \- 72h) / 24).  
 \*    3.2. penaltyFee \= exceeded days \* OVERSTAY\_RATE (100k/day).  
 \* 4\. Log a warning for the violating vehicle.  
 \* 5\. Return the penaltyFee.  
 \*   
 \* @param {Date} checkinTime \- Vehicle entry time  
 \* @param {Date} checkoutTime \- Vehicle exit time  
 \* @returns {number} penaltyAmount \- Total penalty in VND  
 \*/  
export const calculateOverstayPenalty \= (checkinTime, checkoutTime) \=\> {  
    // ... implementation follows the pseudocode exactly  
}

#### **6.3. STRICTLY NO INLINE COMMENTS**

This is an absolute rule based on Clean Code principles.

* **Rule:** Do not inject comments in the middle of function bodies to explain what a line of code does (e.g., // add two numbers, // check if vehicle exists).  
* **Reasoning:** Good code is self-documenting. If you need a comment to explain an if statement, your variable naming is poor, or your function is too long and complex.

**Violation Example (Banned):**

if (s \== 1) { // check if status is 1  
    int x \= a \- b; // calculate refund  
}

**Correct Approach (Self-Documenting):**  
Extract logic into clearly named functions or variables.

if (parkingSession.isInside()) {  
    int refundAmount \= calculateRefundToCustomer(totalPaid, actualFee);  
}

#### **6.4. Declaration Comments (Constants & Enums)**

When declaring constants, magic numbers, or status codes, you must explain their **Meaning**, **Unit of Measurement**, or **Rules**.

/\*\* VNPay payment timeout duration. Unit: Minutes \*/  
private static final int VNPAY\_PAYMENT\_TIMEOUT\_MINUTES \= 15;

/\*\*   
 \* Slot occupancy status.  
 \* 0: AVAILABLE  
 \* 1: OCCUPIED  
 \* 2: MAINTENANCE  
 \*/  
@Column(name \= "slot\_status")  
private int slotStatus;

#### **6.5. Technical Debt Tags (TODO & FIXME)**

Do not let temporary workarounds be forgotten. Use standardized tags so the IDE/Git can track them.

* // TODO(Assignee\_Name): For future enhancements.  
* // FIXME(Assignee\_Name): For known bugs or dirty code that must be refactored before final submission.

// TODO(Member2): Currently hardcoding Zone A, need to integrate getListZone() API next sprint.  
const targetZone \= "ZONE\_A";

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA8AAAAIBAMAAADU/bjBAAAAMFBMVEX///8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx9fPp3uAAAAD3RSTlMAMs3v3Wa7EFSJmSJ2q0T3W+s/AAAAFElEQVR4XmP8zwAGH5kgNAMDeQwAhYECAE0ikyQAAAAASUVORK5CYII=>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA8AAAAIBAMAAADU/bjBAAAAMFBMVEX///8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx9fPp3uAAAAD3RSTlMAMs3v3Wa7EFSJmSJ2q0T3W+s/AAAAFElEQVR4XmP8zwAGH5kgNAMDeQwAhYECAE0ikyQAAAAASUVORK5CYII=>
