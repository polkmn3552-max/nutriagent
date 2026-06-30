console.log("🔥 JS 로딩됨");
/* ============================================================
   NutriAgent — script.js
   Vanilla JavaScript only. Uses Google Gemini Vision API
   to analyze a food image and return structured nutrition data.
============================================================ */
 
"use strict";

/* ============================================================
   🔑 [필수] GEMINI API KEY 설정 위치
   ------------------------------------------------------------
   아래 GEMINI_API_KEY 상수에 직접 키를 넣거나,
   화면 하단의 "Gemini API Key" 입력창에 키를 입력하세요.
   (입력창에 입력하면 이 상수보다 우선 적용됩니다)

   키 발급: https://aistudio.google.com/app/apikey
============================================================ */
const GEMINI_API_KEY = ""; // 예: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"

/* 사용할 Gemini 모델 (Vision 지원 모델) */
const GEMINI_MODEL = "gemini-2.5-flash";
 
/* Gemini REST API Endpoint */
const GEMINI_API_URL = (apiKey) =>
  `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

/* ============================================================
   DOM Elements
============================================================ */
const fileInput = document.getElementById("fileInput");
const uploadZone = document.getElementById("uploadZone");
const selectBtn = document.getElementById("selectBtn");
const uploadPlaceholder = document.getElementById("uploadPlaceholder");
const imagePreviewWrap = document.getElementById("imagePreviewWrap");
const imagePreview = document.getElementById("imagePreview");
const changeImageBtn = document.getElementById("changeImageBtn");
const analyzeBtn = document.getElementById("analyzeBtn");
const apiKeyInput = document.getElementById("apiKeyInput");

const uploadCard = document.getElementById("uploadCard");
const loadingCard = document.getElementById("loadingCard");
const errorCard = document.getElementById("errorCard");
const errorMessage = document.getElementById("errorMessage");
const retryBtn = document.getElementById("retryBtn");
const resultsSection = document.getElementById("resultsSection");
const newAnalysisBtn = document.getElementById("newAnalysisBtn");
const loadingImagePreview = document.getElementById("loadingImagePreview");
const loadingSub = document.getElementById("loadingSub");

/* Result elements */
const foodNameEl = document.getElementById("foodName");
const foodDescriptionEl = document.getElementById("foodDescription");
const scoreRingFg = document.getElementById("scoreRingFg");
const scoreValueEl = document.getElementById("scoreValue");
const calorieValueEl = document.getElementById("calorieValue");
const macroGrid = document.getElementById("macroGrid");
const missingNutrientsEl = document.getElementById("missingNutrients");
const mealGrid = document.getElementById("mealGrid");
const recommendationReasonEl = document.getElementById("recommendationReason");
const todayMissionEl = document.getElementById("todayMission");

/* ============================================================
   State
============================================================ */
let selectedFile = null;
let selectedBase64 = null;
let selectedMimeType = null;
let loadingMessageTimer = null;

const LOADING_MESSAGES = [
  "영양소를 계산하는 중이에요 🍽️",
  "음식 재료를 인식하고 있어요 🔍",
  "칼로리를 추정하고 있어요 🔥",
  "맞춤 식단을 구성하는 중이에요 🥗",
];

/* Restore API key from localStorage if previously entered */
(function restoreApiKey() {
  const saved = localStorage.getItem("nutriagent_gemini_key");
  if (saved) apiKeyInput.value = saved;
})();

apiKeyInput.addEventListener("input", () => {
  localStorage.setItem("nutriagent_gemini_key", apiKeyInput.value.trim());
});

/* ============================================================
   Upload Interactions
============================================================ */
selectBtn.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();

  console.log("📂 file dialog open");

  fileInput.value = "";

  setTimeout(() => {
    fileInput.click();
  }, 0);
});
changeImageBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  resetUpload();
  fileInput.click();
});

fileInput.addEventListener("change", (e) => {
  console.log("🔥 change 이벤트 발생", e.target.files);

  const file = e.target.files[0];
  if (file) handleFileSelect(file);
});

/* Drag & Drop */
["dragenter", "dragover"].forEach((evt) => {
  uploadZone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadZone.classList.add("dragover");
  });
});

["dragleave", "drop"].forEach((evt) => {
  uploadZone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadZone.classList.remove("dragover");
  });
});

uploadZone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelect(file);
});

function handleFileSelect(file) {
  if (!file.type.startsWith("image/")) {
    showError("이미지 파일만 업로드할 수 있습니다. (JPG, PNG 등)");
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    showError("이미지 용량이 너무 큽니다. 10MB 이하 파일을 사용해주세요.");
    return;
  }

  selectedFile = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    imagePreview.src = dataUrl;

    // Extract base64 + mime type for Gemini API payload
    const [meta, base64] = dataUrl.split(",");
    selectedBase64 = base64;
    selectedMimeType = meta.match(/data:(.*);base64/)[1];

    uploadPlaceholder.classList.add("hidden");
    imagePreviewWrap.classList.remove("hidden");
    analyzeBtn.classList.remove("hidden");
  };
  reader.onerror = () => {
    showError("이미지를 불러오는 중 오류가 발생했습니다.");
  };
  reader.readAsDataURL(file);
}

function resetUpload() {
  selectedFile = null;
  selectedBase64 = null;
  selectedMimeType = null;
  fileInput.value = "";
  imagePreview.src = "";
  uploadPlaceholder.classList.remove("hidden");
  imagePreviewWrap.classList.add("hidden");
  analyzeBtn.classList.add("hidden");
}

/* ============================================================
   Analyze Button
============================================================ */
analyzeBtn.addEventListener("click", () => {
  if (!selectedBase64) {
    showError("먼저 음식 이미지를 업로드해주세요.");
    return;
  }
  analyzeFoodImage();
});

retryBtn.addEventListener("click", () => {
  errorCard.classList.add("hidden");
  uploadCard.classList.remove("hidden");
});

newAnalysisBtn.addEventListener("click", () => {
  resultsSection.classList.add("hidden");
  uploadCard.classList.remove("hidden");
  resetUpload();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

/* ============================================================
   Core: Call Gemini Vision API & Analyze Food
============================================================ */
async function analyzeFoodImage() {
  if (!selectedBase64) {
    showError("먼저 음식 이미지를 업로드해주세요.");
    return;
  }

  uploadCard.classList.add("hidden");
  errorCard.classList.add("hidden");
  resultsSection.classList.add("hidden");
  loadingCard.classList.remove("hidden");

  loadingImagePreview.src = imagePreview.src;
  startLoadingMessageRotation();

  try {
    // AI thinking delay (진짜처럼 보이게)
    await new Promise((r) => setTimeout(r, 1800));

    const result = generateMockResult();

    stopLoadingMessageRotation();
    loadingCard.classList.add("hidden");

    renderResults(result);
    resultsSection.classList.remove("hidden");

    window.scrollTo({ top: 0, behavior: "smooth" });

  } catch (err) {
    stopLoadingMessageRotation();
    loadingCard.classList.add("hidden");
    showError("분석 중 오류가 발생했습니다.");
  }
}


 

/* Rotate the loading sub-text every 1.8s for a livelier, premium feel */
function startLoadingMessageRotation() {
  let i = 0;
  loadingSub.textContent = LOADING_MESSAGES[0];
  loadingMessageTimer = setInterval(() => {
    i = (i + 1) % LOADING_MESSAGES.length;
    loadingSub.style.opacity = "0";
    setTimeout(() => {
      loadingSub.textContent = LOADING_MESSAGES[i];
      loadingSub.style.opacity = "1";
    }, 200);
  }, 1800);
}

function stopLoadingMessageRotation() {
  if (loadingMessageTimer) {
    clearInterval(loadingMessageTimer);
    loadingMessageTimer = null;
  }
}

/* ============================================================
   Helpers
============================================================ */

/* Safely parse JSON, stripping markdown code fences if present */
function parseGeminiJson(text) {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```json\s*/i, "").replace(/^```\s*/i, "");
  cleaned = cleaned.replace(/```\s*$/i, "");

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Try to extract the first {...} block as a fallback
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (e2) {
        throw new Error("AI 응답을 해석하는 데 실패했습니다. 다시 시도해주세요.");
      }
    }
    throw new Error("AI 응답을 해석하는 데 실패했습니다. 다시 시도해주세요.");
  }
}

function validateResult(r) {
  const requiredKeys = [
    "foodName",
    "calories",
    "macros",
    "missingNutrients",
    "nextMealRecommendations",
    "recommendationReason",
    "nutritionScore",
    "todayMission",
  ];
  for (const key of requiredKeys) {
    if (r[key] === undefined || r[key] === null) {
      throw new Error("AI 응답 데이터 형식이 올바르지 않습니다. 다시 시도해주세요.");
    }
  }
}

function showError(message) {
  errorMessage.textContent = message;
  uploadCard.classList.add("hidden");
  loadingCard.classList.add("hidden");
  resultsSection.classList.add("hidden");
  errorCard.classList.remove("hidden");
}

/* ============================================================
   Render Results to DOM
============================================================ */
function renderResults(result) {
  // Food name & description
  foodNameEl.textContent = result.foodName || "알 수 없는 음식";
  foodDescriptionEl.textContent = result.description || "";

  // Calories
  const calories = Number(result.calories) || 0;
  calorieValueEl.textContent = `${calories.toLocaleString("ko-KR")} kcal`;

  // Score ring (circumference for r=52 is 2*PI*52 ≈ 326.7)
  const score = clamp(Number(result.nutritionScore) || 0, 0, 100);
  const circumference = 326.7;
  const offset = circumference - (score / 100) * circumference;
  scoreValueEl.textContent = score;
  requestAnimationFrame(() => {
    scoreRingFg.style.strokeDashoffset = offset;
  });
  scoreRingFg.style.stroke = scoreColor(score);

  // Macros
  renderMacros(result.macros || {});

  // Missing nutrients
  missingNutrientsEl.innerHTML = "";
  (result.missingNutrients || []).forEach((nutrient) => {
    const li = document.createElement("li");
    li.textContent = nutrient;
    missingNutrientsEl.appendChild(li);
  });
  if ((result.missingNutrients || []).length === 0) {
    const li = document.createElement("li");
    li.textContent = "특별히 부족한 영양소가 발견되지 않았어요 👍";
    missingNutrientsEl.appendChild(li);
  }

  // Meal recommendations
  mealGrid.innerHTML = "";
  (result.nextMealRecommendations || []).forEach((meal, idx) => {
    const item = document.createElement("div");
    item.className = "meal-item";
    item.innerHTML = `
      <div class="meal-number">${idx + 1}</div>
      <div class="meal-name">${escapeHtml(meal)}</div>
    `;
    mealGrid.appendChild(item);
  });

  // Reason
  recommendationReasonEl.textContent = result.recommendationReason || "";

  // Today's mission
  todayMissionEl.textContent = result.todayMission || "";
}

function renderMacros(macros) {
  const items = [
    { key: "carbs", label: "탄수화물", icon: "🍞", unit: "g", max: 150 },
    { key: "protein", label: "단백질", icon: "🍗", unit: "g", max: 80 },
    { key: "fat", label: "지방", icon: "🥑", unit: "g", max: 60 },
    { key: "fiber", label: "식이섬유", icon: "🥦", unit: "g", max: 30 },
  ];

  macroGrid.innerHTML = "";

  items.forEach((item) => {
    const value = Number(macros[item.key]) || 0;
    const percent = clamp((value / item.max) * 100, 4, 100);

    const div = document.createElement("div");
    div.className = "macro-item";
    div.innerHTML = `
      <div class="macro-name">${item.icon} ${item.label}</div>
      <div class="macro-value">${value}${item.unit}</div>
      <div class="macro-bar-track">
        <div class="macro-bar-fill" style="width:0%" data-target="${percent}"></div>
      </div>
    `;
    macroGrid.appendChild(div);
  });

  // Animate bars after insertion
  requestAnimationFrame(() => {
    document.querySelectorAll(".macro-bar-fill").forEach((bar) => {
      bar.style.width = bar.dataset.target + "%";
    });
  });
}

function scoreColor(score) {
  if (score >= 80) return "#16a34f";
  if (score >= 50) return "#eab308";
  return "#dc2626";
}

function clamp(num, min, max) {
  return Math.min(Math.max(num, min), max);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function generateMockResult() {
  const foods = [
    {
      name: "닭가슴살 샐러드",
      desc: "신선한 채소와 단백질이 균형 잡힌 건강식입니다.",
    },
    {
      name: "김치볶음밥",
      desc: "탄수화물과 지방이 풍부한 한국 대표 가정식입니다.",
    },
    {
      name: "연어 덮밥",
      desc: "오메가3가 풍부한 영양 균형이 좋은 식사입니다.",
    },
    {
      name: "불고기 정식",
      desc: "단백질과 나트륨이 함께 포함된 전통 한식입니다.",
    },
  ];

  const f = foods[Math.floor(Math.random() * foods.length)];

  return {
    foodName: f.name,
    description: f.desc,
    calories: rand(350, 850),
    macros: {
      carbs: rand(30, 120),
      protein: rand(15, 60),
      fat: rand(10, 40),
      fiber: rand(3, 15),
    },
    missingNutrients: [
      "비타민 C",
      "오메가-3",
      "칼륨",
    ].sort(() => 0.5 - Math.random()).slice(0, 2),

    nextMealRecommendations: [
      "그릭 요거트 + 견과류",
      "바나나 + 단백질 쉐이크",
      "현미밥 + 계란찜",
    ].sort(() => 0.5 - Math.random()).slice(0, 3),

    recommendationReason:
      "현재 식단은 단백질과 탄수화물은 충분하지만 일부 미량 영양소가 부족할 수 있습니다. 다음 식사에서는 비타민과 미네랄 균형을 맞추는 것이 좋습니다.",

    nutritionScore: rand(55, 95),

    todayMission:
      "오늘 물 2L 마시고, 채소를 한 끼 이상 꼭 포함해보세요 🥗",
  };
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
