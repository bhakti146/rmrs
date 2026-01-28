/*
  Rapid Medical Response - Frontend Logic

  Flow:
  1. Home page with big EMERGENCY button.
  2. On click: show processing, get location, find nearest ambulance + hospital.
  3. Show emergency screen (status + cards), and auto-open AI-style first-aid guidance.
  4. Guidance asks:
     - What emergency happened?
     - How is the patient's health?
     - Is the patient conscious?
     - How is breathing?
     - Is there heavy bleeding?
  5. Rule-based instructions are shown based on answers.
*/

document.addEventListener("DOMContentLoaded", () => {
  // Sections
  const homeScreen = document.getElementById("home-screen");
  const processingScreen = document.getElementById("processing-screen");
  const activeEmergencyScreen = document.getElementById("active-emergency-screen");
  const firstAidScreen = document.getElementById("first-aid-screen");
  const tipsScreen = document.getElementById("tips-screen");

  // Buttons
  const emergencyBtn = document.getElementById("emergency-btn");
  const openFirstAidBtn = document.getElementById("open-first-aid-btn");
  const resetGuidanceBtn = document.getElementById("reset-guidance-btn");
  const tabButtons = document.querySelectorAll(".tab-btn");

  // Status icons
  const statusRequest = document.getElementById("status-request");
  const statusAmbulance = document.getElementById("status-ambulance");
  const statusHospital = document.getElementById("status-hospital");

  // Ambulance / hospital elements
  const ambulanceNameEl = document.getElementById("ambulance-name");
  const ambulanceDistanceEl = document.getElementById("ambulance-distance");
  const ambulanceEtaEl = document.getElementById("ambulance-eta");
  const callDriverBtn = document.getElementById("call-driver-btn");
  const driverNumberText = document.getElementById("driver-number-text");

  const hospitalNameEl = document.getElementById("hospital-name");

  // Map
  const locationText = document.getElementById("location-text");
  const mapFrame = document.getElementById("map-frame");
  const fullMapLink = document.getElementById("open-full-map-link");

  // Toast
  const toastEl = document.getElementById("toast");

  // First-aid chat elements
  const chatLog = document.getElementById("chat-log");
  const chatOptions = document.getElementById("chat-options");

  // First-aid state
  const firstAidState = {
    emergencyType: null,   // accident | heart | breathing | unconscious | other
    patientHealth: null,   // stable | moderate | critical
    conscious: null,       // yes | no
    breathing: null,       // normal | difficult | none
    bleeding: null         // yes | no
  };

  const firstAidQuestions = [
    {
      id: "emergencyType",
      text: "What type of emergency is this?",
      options: [
        { value: "accident", label: "Road accident / injury" },
        { value: "heart", label: "Chest pain / heart issue" },
        { value: "breathing", label: "Breathing problem" },
        { value: "unconscious", label: "Person unconscious" },
        { value: "other", label: "Other / not sure" }
      ]
    },
    {
      id: "patientHealth",
      text: "How is the patient's overall condition?",
      options: [
        { value: "stable", label: "Stable" },
        { value: "moderate", label: "Serious but awake" },
        { value: "critical", label: "Very critical" }
      ]
    },
    {
      id: "conscious",
      text: "Is the patient conscious (responding when you talk or touch)?",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" }
      ]
    },
    {
      id: "breathing",
      text: "How is the breathing?",
      options: [
        { value: "normal", label: "Normal" },
        { value: "difficult", label: "Difficult or noisy" },
        { value: "none", label: "Not breathing" }
      ]
    },
    {
      id: "bleeding",
      text: "Is there heavy bleeding that is not stopping?",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" }
      ]
    }
  ];

  let currentQuestionIndex = 0;
  let isTyping = false;

  // --- Event bindings ---

  emergencyBtn.addEventListener("click", startEmergency);
  openFirstAidBtn.addEventListener("click", () => showFirstAidSection(true));
  resetGuidanceBtn.addEventListener("click", resetFirstAidChat);

  chatOptions.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-question-id]");
    if (!btn || isTyping) return;
    const qId = btn.getAttribute("data-question-id");
    const value = btn.getAttribute("data-value");
    handleAnswer(qId, value);
  });

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      switchTab(targetId, btn);
    });
  });

  // --- Tab handling ---

  function switchTab(targetId, button) {
    tabButtons.forEach((b) => b.classList.remove("tab-btn-active"));
    button.classList.add("tab-btn-active");

    homeScreen.classList.add("hidden");
    tipsScreen.classList.add("hidden");

    if (targetId === "home-screen") {
      homeScreen.classList.remove("hidden");
    } else if (targetId === "tips-screen") {
      tipsScreen.classList.remove("hidden");
    }
  }

  // --- Emergency flow ---

  function startEmergency() {
    // ensure Emergency tab selected visually
    tabButtons.forEach((b) => {
      if (b.getAttribute("data-target") === "home-screen") {
        b.classList.add("tab-btn-active");
      } else {
        b.classList.remove("tab-btn-active");
      }
    });

    setStatusIcon(statusRequest, false);
    setStatusIcon(statusAmbulance, false);
    setStatusIcon(statusHospital, false);

    homeScreen.classList.add("hidden");
    tipsScreen.classList.add("hidden");
    firstAidScreen.classList.add("hidden");
    activeEmergencyScreen.classList.add("hidden");
    processingScreen.classList.remove("hidden");

    showToast("Trying to detect your location…");

    if (!navigator.geolocation) {
      const fallbackLocation = { lat: 28.6139, lng: 77.209 };
      showToast("Location not available. Using approximate location.");
      simulateProcessing(fallbackLocation, true);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        simulateProcessing(coords, false);
      },
      () => {
        const fallbackLocation = { lat: 28.6139, lng: 77.209 };
        showToast("Unable to get exact location. Using approximate location.");
        simulateProcessing(fallbackLocation, true);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  function simulateProcessing(userLocation, isApproximate) {
    const coordText = `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(
      4
    )} ${isApproximate ? "(approx.)" : ""}`;
    locationText.textContent = `Detected location: ${coordText}`;
    updateMap(userLocation);

    const ambulances = generateNearbyAmbulances(userLocation);
    const hospitals = generateNearbyHospitals(userLocation);

    // Simulate a short timeline: request sent -> ambulance -> hospital
    setStatusIcon(statusRequest, true);

    setTimeout(() => {
      const nearestAmbulance = findNearest(userLocation, ambulances);
      updateAmbulanceUI(nearestAmbulance);
      setStatusIcon(statusAmbulance, true);
    }, 900);

    setTimeout(() => {
      const nearestHospital = findNearest(userLocation, hospitals);
      updateHospitalUI(nearestHospital);
      setStatusIcon(statusHospital, true);

      processingScreen.classList.add("hidden");
      activeEmergencyScreen.classList.remove("hidden");

      // Auto-open first-aid guidance after emergency is active
      showFirstAidSection(true);
      resetFirstAidChat();

      showToast("Ambulance and hospital notified. Start first-aid guidance.");
    }, 1500);
  }

  // --- Map + dummy data ---

  function updateMap(location) {
    if (!mapFrame) return;
    const { lat, lng } = location;
    const zoom = 15;
    const delta = 0.02;

    const left = lng - delta;
    const right = lng + delta;
    const top = lat + delta;
    const bottom = lat - delta;

    const embedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
      left
    )}%2C${encodeURIComponent(bottom)}%2C${encodeURIComponent(
      right
    )}%2C${encodeURIComponent(top)}&layer=mapnik&marker=${encodeURIComponent(
      lat
    )}%2C${encodeURIComponent(lng)}`;

    const fullUrl = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(
      lat
    )}&mlon=${encodeURIComponent(lng)}#map=${zoom}/${encodeURIComponent(
      lat
    )}/${encodeURIComponent(lng)}`;

    mapFrame.src = embedUrl;
    fullMapLink.href = fullUrl;
    fullMapLink.classList.remove("hidden");
  }

  // random offsets so ambulances/hospitals are within a few km
  function randomOffsetKm(maxKm) {
    const earthRadiusKm = 6371;
    const distanceKm = Math.random() * maxKm;
    const angle = Math.random() * 2 * Math.PI;

    const deltaLat = (distanceKm / earthRadiusKm) * (180 / Math.PI);
    const deltaLng =
      (distanceKm / earthRadiusKm) * (180 / Math.PI) * Math.cos(0); // approx

    return {
      lat: deltaLat * Math.sin(angle),
      lng: deltaLng * Math.cos(angle)
    };
  }

  function generateNearbyAmbulances(center) {
    const baseNames = ["CityCare Ambulance", "Quick Response Ambulance", "MedExpress Ambulance"];
    const result = [];
    for (let i = 0; i < 3; i++) {
      const offset = randomOffsetKm(2 + i); // ~2–4 km
      result.push({
        name: `${baseNames[i]} ${i + 1}`,
        phone: i === 0 ? "+91-9876543210" : i === 1 ? "+91-9812345678" : "+91-9998887770",
        lat: center.lat + offset.lat,
        lng: center.lng + offset.lng
      });
    }
    return result;
  }

  function generateNearbyHospitals(center) {
    const names = ["City General Hospital", "Shanti Multi-Speciality Hospital", "Metro Care Hospital"];
    const result = [];
    for (let i = 0; i < 3; i++) {
      const offset = randomOffsetKm(3 + i); // ~3–5 km
      result.push({
        name: names[i],
        lat: center.lat + offset.lat,
        lng: center.lng + offset.lng
      });
    }
    return result;
  }

  function findNearest(userLocation, items) {
    let nearest = null;
    let shortest = Infinity;
    for (const item of items) {
      const d = haversine(userLocation.lat, userLocation.lng, item.lat, item.lng);
      if (d < shortest) {
        shortest = d;
        nearest = { ...item, distanceKm: d };
      }
    }
    return nearest;
  }

  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function updateAmbulanceUI(ambulance) {
    if (!ambulance) {
      ambulanceNameEl.textContent = "No ambulance found";
      ambulanceDistanceEl.textContent = "-- km";
      ambulanceEtaEl.textContent = "-- minutes";
      callDriverBtn.disabled = true;
      return;
    }

    ambulanceNameEl.textContent = ambulance.name;
    ambulanceDistanceEl.textContent = `${ambulance.distanceKm.toFixed(1)} km (approx.)`;

    const speedKmH = 35; // city traffic
    const minutes = Math.round((ambulance.distanceKm / speedKmH) * 60);
    const clampedMinutes = Math.min(Math.max(minutes, 3), 7); // clamp to 3–7 min
    ambulanceEtaEl.textContent = `${clampedMinutes} minutes (estimated)`;

    driverNumberText.textContent = `Driver phone: ${ambulance.phone}`;
    const telHref = `tel:${ambulance.phone.replace(/\s+/g, "")}`;
    callDriverBtn.disabled = false;
    callDriverBtn.onclick = () => (window.location.href = telHref);
  }

  function updateHospitalUI(hospital) {
    hospitalNameEl.textContent = hospital ? hospital.name : "No hospital found";
  }

  // --- Status + toast ---

  function setStatusIcon(el, success) {
    if (!el) return;
    if (success) {
      el.textContent = "✅";
      el.classList.remove("status-pending");
      el.classList.add("status-ok");
    } else {
      el.textContent = "⏳";
      el.classList.remove("status-ok");
      el.classList.add("status-pending");
    }
  }

  let toastTimeoutId = null;
  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.remove("hidden");
    toastEl.classList.add("show");

    if (toastTimeoutId) clearTimeout(toastTimeoutId);
    toastTimeoutId = setTimeout(() => {
      toastEl.classList.remove("show");
      setTimeout(() => toastEl.classList.add("hidden"), 200);
    }, 2600);
  }

  // --- First-aid chat ---

  function showFirstAidSection(scroll) {
    firstAidScreen.classList.remove("hidden");
    if (scroll) firstAidScreen.scrollIntoView({ behavior: "smooth" });
  }

  function resetFirstAidChat() {
    for (const key in firstAidState) firstAidState[key] = null;
    currentQuestionIndex = 0;
    chatLog.innerHTML = "";
    chatOptions.innerHTML = "";

    addSystemMessage("We will ask a few quick questions to match the right first-aid steps.");
    addSystemMessage("Stay calm. Help is already on the way.");
    showNextQuestion();
  }

  function addChatMessage(sender, text, small = false) {
    const msg = document.createElement("div");
    msg.className = `chat-message ${sender}`;
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${sender}${small ? " small" : ""}`;
    bubble.textContent = text;
    msg.appendChild(bubble);
    chatLog.appendChild(msg);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function addSystemMessage(text, small = false) {
    addChatMessage("system", text, small);
  }

  function addUserMessage(text) {
    addChatMessage("user", text);
  }

  function showTypingIndicator() {
    const msg = document.createElement("div");
    msg.className = "chat-message system";
    msg.id = "typing-indicator";
    const bubble = document.createElement("div");
    bubble.className = "chat-bubble system";
    const indicator = document.createElement("span");
    indicator.className = "typing-indicator";
    indicator.innerHTML =
      '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
    bubble.appendChild(indicator);
    msg.appendChild(bubble);
    chatLog.appendChild(msg);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function hideTypingIndicator() {
    const el = document.getElementById("typing-indicator");
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function showNextQuestion() {
    chatOptions.innerHTML = "";
    if (currentQuestionIndex >= firstAidQuestions.length) {
      generateAndShowGuidance();
      return;
    }

    const q = firstAidQuestions[currentQuestionIndex];
    addSystemMessage(q.text);

    q.options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "btn btn-small btn-outline";
      btn.textContent = opt.label;
      btn.setAttribute("data-question-id", q.id);
      btn.setAttribute("data-value", opt.value);
      chatOptions.appendChild(btn);
    });
  }

  function handleAnswer(questionId, value) {
    firstAidState[questionId] = value;

    const q = firstAidQuestions.find((qq) => qq.id === questionId);
    const label = q?.options.find((o) => o.value === value)?.label || value;
    addUserMessage(label);
    chatOptions.innerHTML = "";

    currentQuestionIndex += 1;

    isTyping = true;
    showTypingIndicator();
    setTimeout(() => {
      hideTypingIndicator();
      isTyping = false;
      showNextQuestion();
    }, 650);
  }

  function generateAndShowGuidance() {
    const {
      emergencyType,
      patientHealth,
      conscious,
      breathing,
      bleeding
    } = firstAidState;

    const steps = [];

    // Emergency type specific
    if (emergencyType === "accident") {
      steps.push("Ensure the area is safe. Move the patient away from traffic if possible.");
      steps.push("Do not move the neck or spine if you suspect head or back injury.");
    } else if (emergencyType === "heart") {
      steps.push("Make the patient sit in a semi-upright position, back supported.");
      steps.push("Ask if they have heart medicines prescribed and help them take it only if they confirm.");
    } else if (emergencyType === "breathing") {
      steps.push("Help the patient sit slightly forward, with support for arms and back.");
      steps.push("Loosen tight clothing around the neck and chest.");
    } else if (emergencyType === "unconscious") {
      steps.push("Check quickly if the patient is breathing.");
      steps.push("Lay them on their back on a flat surface and open the airway (head tilt, chin lift).");
    } else if (emergencyType === "other") {
      steps.push("Keep the patient comfortable and away from any danger.");
    }

    // Overall condition
    if (patientHealth === "stable") {
      steps.push("Keep talking to the patient and monitor their condition every few minutes.");
    } else if (patientHealth === "moderate") {
      steps.push("Avoid unnecessary movement and keep the patient warm and comfortable.");
    } else if (patientHealth === "critical") {
      steps.push("Do not delay. Focus on basic life support: breathing, bleeding control, and consciousness.");
    }

    // Consciousness
    if (conscious === "no") {
      steps.push("If unresponsive, shout for help and check breathing immediately.");
      steps.push("If there is no normal breathing, start CPR if you are trained.");
      steps.push("Do not give anything to drink or eat.");
    } else if (conscious === "yes") {
      steps.push("Reassure the patient and ask where they feel pain or discomfort.");
    }

    // Breathing
    if (breathing === "none") {
      steps.push("If trained, start chest compressions immediately (30 compressions then 2 breaths).");
      steps.push("If not trained, give hands-only CPR: push hard and fast in the center of the chest.");
    } else if (breathing === "difficult") {
      steps.push("Encourage slow, deep breaths. Keep them sitting slightly forward.");
      steps.push("Remove any tight clothing, scarf, or tie from the neck area.");
    } else if (breathing === "normal") {
      steps.push("Keep checking breathing every 1–2 minutes.");
    }

    // Bleeding
    if (bleeding === "yes") {
      steps.push("Apply firm, direct pressure to the wound using a clean cloth or bandage.");
      steps.push("If blood soaks through, do not remove the first cloth. Add another on top and keep pressing.");
      steps.push("If safe, raise the bleeding area above the level of the heart.");
      steps.push("Do not apply a tourniquet unless you are trained.");
    } else if (bleeding === "no") {
      steps.push("Look quickly for hidden bleeding or obvious fractures.");
    }

    // General
    steps.push("Stay with the patient and speak calmly.");
    steps.push("Do not move the patient if you suspect head, neck, or back injury unless there is immediate danger.");
    steps.push("Be ready to share what happened with the ambulance and hospital staff.");

    addSystemMessage("Here are your first-aid steps:", true);
    steps.forEach((step) => addSystemMessage(`• ${step}`, true));
    addSystemMessage("Follow these steps until the ambulance team takes over.");
  }

  // --- Init ---

  resetFirstAidChat(); // prepare guidance for when emergency starts
});
