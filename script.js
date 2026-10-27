const guides = [
  {
    icon: "01",
    title: "Bleeding",
    description: "Control serious bleeding and reduce shock risk.",
    steps: [
      "Make sure the scene is safe and use a protective barrier if available.",
      "Apply firm, continuous direct pressure with clean gauze or cloth.",
      "For severe or uncontrolled bleeding, get emergency medical help immediately.",
      "Keep the person warm and monitor their breathing until help arrives."
    ]
  },
  {
    icon: "02",
    title: "Burns",
    description: "Cool the burn and protect the injury.",
    steps: [
      "Move away from the heat source safely.",
      "Cool a minor thermal burn under cool running water; do not use ice.",
      "Remove jewellery or clothing near the burn only if it is not stuck.",
      "Cover loosely with a clean, non-stick dressing and seek care for serious burns."
    ]
  },
  {
    icon: "03",
    title: "Choking",
    description: "Recognize when someone cannot breathe normally.",
    steps: [
      "If the person can cough or speak, encourage coughing and monitor them.",
      "If they cannot breathe, speak, or cough effectively, call for emergency help.",
      "Use age-appropriate choking techniques only if you are trained to do so.",
      "If they become unresponsive, follow emergency-dispatch instructions."
    ]
  },
  {
    icon: "04",
    title: "Fainting",
    description: "Keep them safe while they recover.",
    steps: [
      "Help the person lie down safely and protect them from injury.",
      "Check responsiveness and normal breathing.",
      "Loosen tight clothing and allow fresh air.",
      "If they do not quickly recover or breathing is abnormal, get urgent medical help."
    ]
  },
  {
    icon: "05",
    title: "Fractures",
    description: "Avoid unnecessary movement.",
    steps: [
      "Keep the injured area still and support it in the position found.",
      "Do not try to straighten a deformed limb.",
      "Control bleeding around the injury without pressing exposed bone.",
      "Seek professional assessment, especially for severe pain or deformity."
    ]
  },
  {
    icon: "06",
    title: "Seizures",
    description: "Protect them from injury.",
    steps: [
      "Clear nearby hazards and cushion the head if possible.",
      "Do not restrain the person or put anything in their mouth.",
      "Time the seizure and monitor breathing afterward.",
      "Seek emergency help for a prolonged seizure, injury, or breathing problems."
    ]
  },
  {
    icon: "07",
    title: "CPR",
    description: "Learn CPR from a certified instructor.",
    steps: [
      "Check that the scene is safe and check the person's responsiveness.",
      "Call emergency services and ask someone to get an AED if available.",
      "If the person is not breathing normally, follow dispatcher instructions.",
      "Use an AED as soon as available and follow its voice and visual prompts."
    ]
  }
];

const questions = [
  {
    question: "A friend suddenly collapses outside the library. What should you do first?",
    answers: [
      "Check the scene is safe, check responsiveness and breathing, and call for help",
      "Give them water immediately",
      "Move them somewhere private before checking them",
      "Wait five minutes"
    ],
    correct: 0
  },
  {
    question: "Someone is having a seizure. Which action is safest?",
    answers: [
      "Hold their arms and legs down",
      "Put an object in their mouth",
      "Clear hazards and protect their head",
      "Give them food"
    ],
    correct: 2
  },
  {
    question: "For a minor thermal burn, which immediate action is appropriate?",
    answers: [
      "Apply ice directly",
      "Cool it with cool running water",
      "Rub it firmly",
      "Burst any blisters"
    ],
    correct: 1
  },
  {
    question: "A conscious person is coughing strongly after food goes down the wrong way. What is generally appropriate?",
    answers: [
      "Encourage them to keep coughing and monitor them",
      "Immediately give them water",
      "Put your fingers into their mouth",
      "Make them lie flat"
    ],
    correct: 0
  },
  {
    question: "Why is Pulse Point promoting first-aid training?",
    answers: [
      "To replace medical professionals",
      "To help students respond safely while professional help is obtained",
      "To diagnose illnesses",
      "To provide prescriptions"
    ],
    correct: 1
  }
];

const eventUrl = "/api/events";
const sessionStorageKey = "pulse-point-session";
const sessionId = getSessionId();

function getSessionId() {
  try {
    const storedId = window.sessionStorage.getItem(sessionStorageKey);
    if (storedId) return storedId;
    const newId = window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(sessionStorageKey, newId);
    return newId;
  } catch {
    // Storage can be blocked in private browsing; keep event IDs valid for the API.
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

function track(event, details = {}) {
  const payload = {
    event,
    path: window.location.pathname || "/",
    session_id: sessionId,
    details
  };

  return fetch(eventUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true
  }).then((response) => response.ok).catch(() => false);
}

function shortLabel(element) {
  const label = element.getAttribute("aria-label") || element.innerText || element.textContent || "Action";
  return label.replace(/\s+/g, " ").trim().slice(0, 120) || "Action";
}

document.addEventListener("click", (event) => {
  const source = event.target instanceof Element ? event.target : event.target.parentElement;
  const action = source?.closest("a, button, [role='button']");
  if (!action || action.dataset.trackManaged === "true") return;

  const href = action.getAttribute("href");
  const target = action.dataset.mapPoint || (href?.startsWith("#") ? href : "");
  const section = action.closest("section[id]")?.id || "header";
  track("customer_action", { label: shortLabel(action), target, section });
}, true);

track("page_view", { title: document.title });

const sectionObserver = "IntersectionObserver" in window
  ? new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        track("section_view", { section: entry.target.id, title: entry.target.getAttribute("aria-label") || entry.target.querySelector("h1, h2")?.textContent?.trim() || entry.target.id });
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.35 })
  : null;

if (sectionObserver) {
  document.querySelectorAll("main > section[id]").forEach((section) => sectionObserver.observe(section));
}

const guideCards = document.querySelector("#guideCards");
const modal = document.querySelector("#modal");
const modalClose = document.querySelector("#close");
let modalReturnFocus = null;
let currentGuide = null;

guides.forEach((guide, index) => {
  const card = document.createElement("button");
  card.className = "guide-card";
  card.dataset.reveal = "";
  card.type = "button";
  card.dataset.guide = String(index);
  card.dataset.trackManaged = "true";
  card.setAttribute("aria-haspopup", "dialog");

  const icon = document.createElement("span");
  icon.className = "guide-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = guide.icon;

  const title = document.createElement("h3");
  title.textContent = guide.title;

  const description = document.createElement("p");
  description.textContent = guide.description;

  const arrow = document.createElement("span");
  arrow.className = "guide-arrow";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "↗";

  card.append(icon, title, description, arrow);
  guideCards.append(card);
});

function closeGuide() {
  if (modal.hidden) return;
  modal.hidden = true;
  document.body.classList.remove("modal-open");
  track("guide_close", { guide: currentGuide || "Quick guide" });
  currentGuide = null;
  modalReturnFocus?.focus();
}

guideCards.addEventListener("click", (event) => {
  const card = event.target.closest(".guide-card");
  if (!card) return;

  const guide = guides[Number(card.dataset.guide)];
  if (!guide) return;
  currentGuide = guide.title;
  modalReturnFocus = card;
  document.querySelector("#modalTitle").textContent = guide.title;

  const list = document.createElement("ol");
  guide.steps.forEach((step) => {
    const item = document.createElement("li");
    item.textContent = step;
    list.append(item);
  });
  document.querySelector("#modalBody").replaceChildren(list);
  modal.hidden = false;
  document.body.classList.add("modal-open");
  modalClose.focus();
  track("guide_open", { guide: guide.title });
});

modalClose.addEventListener("click", closeGuide);
modal.addEventListener("click", (event) => {
  if (event.target.closest("[data-modal-dismiss]")) closeGuide();
});
modal.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  const focusable = [...modal.querySelectorAll("button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])")]
    .filter((element) => !element.hidden);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
    event.preventDefault();
    first.focus();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeGuide();
});

const menuButton = document.querySelector("#menu");
const nav = document.querySelector("#nav");
menuButton.addEventListener("click", () => {
  const isOpen = nav.classList.toggle("open");
  menuButton.setAttribute("aria-expanded", String(isOpen));
  menuButton.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
  menuButton.dataset.trackManaged = "true";
  track("customer_action", { label: isOpen ? "Open menu" : "Close menu", target: "#nav", section: "header" });
});
nav.addEventListener("click", (event) => {
  if (!event.target.closest("a")) return;
  nav.classList.remove("open");
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", "Open menu");
});

const mapCaption = document.querySelector(".map-caption");
document.querySelectorAll("[data-map-point]").forEach((marker) => {
  marker.addEventListener("click", () => {
    document.querySelectorAll("[data-map-point]").forEach((item) => item.setAttribute("aria-pressed", String(item === marker)));
    mapCaption.textContent = `${marker.dataset.mapPoint} · demo marker only; this location is not verified.`;
  });
});

let questionIndex = 0;
let score = 0;
const questionNode = document.querySelector("#question");
const answersNode = document.querySelector("#answers");
const questionCount = document.querySelector("#qcount");
const progressTrack = document.querySelector(".progress");
const quizFeedback = document.querySelector("#quizFeedback");

function setProgress(step) {
  progressTrack.classList.remove("step-1", "step-2", "step-3", "step-4", "step-5");
  if (step > 0) progressTrack.classList.add(`step-${step}`);
}

function renderQuestion() {
  if (questionIndex >= questions.length) {
    finishChallenge();
    return;
  }

  const item = questions[questionIndex];
  questionNode.textContent = item.question;
  questionCount.textContent = `QUESTION ${questionIndex + 1} OF ${questions.length}`;
  quizFeedback.textContent = "";
  setProgress(questionIndex);
  answersNode.replaceChildren();

  item.answers.forEach((answer, index) => {
    const button = document.createElement("button");
    button.className = "answer";
    button.type = "button";
    button.dataset.answer = String(index);
    button.dataset.trackManaged = "true";

    const letter = document.createElement("span");
    letter.className = "answer-letter";
    letter.setAttribute("aria-hidden", "true");
    letter.textContent = String.fromCharCode(65 + index);

    const text = document.createElement("span");
    text.textContent = answer;
    button.append(letter, text);
    answersNode.append(button);
  });
}

function finishChallenge() {
  questionNode.textContent = `You scored ${score}/${questions.length}`;
  questionCount.textContent = "CHALLENGE COMPLETE";
  setProgress(questions.length);
  quizFeedback.textContent = score >= 4
    ? "Excellent awareness. Keep building your skills through certified first-aid training."
    : "A good start. Explore the guides and consider certified first-aid training.";
  answersNode.replaceChildren();

  const retry = document.createElement("button");
  retry.className = "button button-red quiz-retry";
  retry.type = "button";
  retry.dataset.trackManaged = "true";
  retry.textContent = "Try again";
  answersNode.append(retry);

  track("quiz_complete", { score, total: questions.length });
}

answersNode.addEventListener("click", (event) => {
  const retry = event.target.closest(".quiz-retry");
  if (retry) {
    questionIndex = 0;
    score = 0;
    track("challenge_retry");
    renderQuestion();
    return;
  }

  const answer = event.target.closest(".answer");
  if (!answer || answer.disabled) return;

  const choice = Number(answer.dataset.answer);
  const current = questions[questionIndex];
  const isCorrect = choice === current.correct;
  if (isCorrect) score += 1;
  answer.classList.add(isCorrect ? "correct" : "wrong");
  answersNode.querySelectorAll(".answer").forEach((button) => {
    button.disabled = true;
    if (Number(button.dataset.answer) === current.correct) button.classList.add("correct");
  });
  quizFeedback.textContent = isCorrect ? "That is the safer first step." : "Review the highlighted answer, then keep going.";
  track("quiz_answer", {
    question_number: questionIndex + 1,
    question: current.question,
    choice: current.answers[choice],
    is_correct: isCorrect
  });

  window.setTimeout(() => {
    questionIndex += 1;
    renderQuestion();
  }, 700);
});

renderQuestion();

const joinForm = document.querySelector("#joinForm");
const formMessage = document.querySelector("#formMsg");
const submitButton = joinForm.querySelector("button[type='submit']");
submitButton.dataset.trackManaged = "true";

joinForm.addEventListener("invalid", () => {
  track("join_error", { reason: "validation" });
}, true);

joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = new FormData(joinForm);
  const details = {
    name: String(values.get("name") || "").trim(),
    email: String(values.get("email") || "").trim(),
    interest: String(values.get("interest") || "")
  };

  formMessage.className = "form-message";
  formMessage.textContent = "Sending your interest…";
  submitButton.disabled = true;
  const sent = await track("join_submit", details);
  submitButton.disabled = false;

  if (sent) {
    joinForm.reset();
    formMessage.classList.add("is-success");
    formMessage.textContent = "Thanks. Your interest has been sent to the Pulse Point team.";
  } else {
    formMessage.classList.add("is-error");
    formMessage.textContent = "We could not send your interest right now. Please try again later.";
  }
});

const revealTargets = document.querySelectorAll(
  ".stats > div, .about-grid > div, .section-topline, .challenge-intro, .quiz, .learning-card, .map-copy, .map-card, .join-copy, .join-form"
);
revealTargets.forEach((element) => { element.dataset.reveal = ""; });

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.14, rootMargin: "0px 0px -36px 0px" });
  document.querySelectorAll("[data-reveal]").forEach((element) => revealObserver.observe(element));
} else {
  document.querySelectorAll("[data-reveal]").forEach((element) => element.classList.add("is-visible"));
}
