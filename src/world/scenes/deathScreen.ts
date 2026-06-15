import { AppBase } from 'playcanvas';
import { removeBattleHUD } from '../../util/battleHUD';
import { Question } from '../../util/question';

export function showDeathScreen(options?: {
  app?: AppBase;
  onMainMenu?: () => void;
  onRestart?: () => void;
  timePeriod?: number;
  message?: string;
}) {

  if (typeof document === 'undefined') return;
  removeBattleHUD();
  document.querySelectorAll('.overlay').forEach((el) => {
    if ((el as HTMLElement).id !== 'death-screen') {
      el.remove();
    }
  });
  const hoverLabel = document.getElementById('battle-hover-label');
  if (hoverLabel) {
    hoverLabel.remove();
  }
  if (document.getElementById('death-screen')) return;

  const { onMainMenu, onRestart, timePeriod = -1, message = 'You have died' } = options ?? {};

  const overlay = document.createElement('div');
  overlay.id = 'death-screen';

  const card = document.createElement('div');
  card.className = 'death-card';

  const title = document.createElement('h1');
  title.className = 'death-title';
  title.textContent = 'You Died!';

  const desc = document.createElement('p');
  desc.className = 'death-message';
  desc.textContent = message;

  const divider = document.createElement('hr');
  divider.className = 'death-divider';

  const quizIntro = document.createElement('p');
  quizIntro.className = 'death-quiz-intro';
  quizIntro.textContent = 'Answer 3 questions correctly to continue.';

  const periodLabel = document.createElement('p');
  periodLabel.className = 'death-period-info';
  periodLabel.textContent = timePeriod >= 0
    ? `Questions pulled from time period ${timePeriod}.`
    : 'Questions pulled from the full pool.';

  const progress = document.createElement('p');
  progress.className = 'death-progress';
  progress.textContent = 'Question 0 of 3';

  const questionText = document.createElement('p');
  questionText.className = 'death-question';

  const choiceRow = document.createElement('div');
  choiceRow.className = 'death-choices';

  const feedback = document.createElement('p');
  feedback.className = 'death-feedback';

  const actionRow = document.createElement('div');
  actionRow.className = 'death-actions';
  actionRow.style.display = 'none';

  const restartButton = document.createElement('button');
  restartButton.className = 'death-btn primary';
  restartButton.textContent = 'Revive';
  restartButton.addEventListener('click', () => {
    if (onRestart) {
      onRestart();
      return;
    }
    if (onMainMenu) {
      onMainMenu();
      return;
    }
    window.location.href = '/';
  });

  // const menuButton = document.createElement('button');
  // menuButton.className = 'death-btn ghost';
  // menuButton.textContent = 'Main Menu';
  // menuButton.addEventListener('click', () => {
  //   if (onMainMenu) return onMainMenu();
  //   window.location.href = '/';
  // });

  actionRow.appendChild(restartButton);
  // actionRow.appendChild(menuButton);

  let correctAnswers = 0;

  const showActions = () => {
    choiceRow.replaceChildren();
    feedback.textContent = 'You survived the quiz gate.';
    progress.textContent = 'Unlocked';
    actionRow.style.display = 'flex';
  };

  const loadQuestion = () => {
    if (correctAnswers >= 3) {
      showActions();
      return;
    }

    const nextQuestion = Question.getRandomQuestionWithChoices(timePeriod);
    if (!nextQuestion) {
      correctAnswers = 3;
      showActions();
      return;
    }

    progress.textContent = `Question ${correctAnswers + 1} of 3`;
    feedback.textContent = '';
    questionText.textContent = nextQuestion.question;
    choiceRow.replaceChildren();

    for (const choice of nextQuestion.choices) {
      const choiceButton = document.createElement('button');
      choiceButton.className = 'death-btn';
      choiceButton.textContent = choice;
      choiceButton.addEventListener('click', () => {
        if (choice === nextQuestion.correctAnswer) {
          correctAnswers += 1;
          if (correctAnswers >= 3) {
            showActions();
            return;
          }
          feedback.textContent = 'Correct. Next question...';
          loadQuestion();
        } else {
          feedback.textContent = 'Incorrect. Try again.';
        }
      });
      choiceRow.appendChild(choiceButton);
    }
  };

  card.appendChild(title);
  card.appendChild(desc);
  card.appendChild(divider);
  card.appendChild(quizIntro);
  card.appendChild(periodLabel);
  card.appendChild(progress);
  card.appendChild(questionText);
  card.appendChild(choiceRow);
  card.appendChild(feedback);
  card.appendChild(actionRow);

  overlay.appendChild(card);

  document.body.appendChild(overlay);

  loadQuestion();
}

export function hideDeathScreen() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('death-screen');
  if (el) el.remove();
  const canvas = document.querySelector('canvas');
  if (canvas instanceof HTMLCanvasElement) {
    canvas.style.display = '';
  }
}

export function isDeathScreenVisible(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  return document.getElementById('death-screen') !== null;
}

export default { showDeathScreen, hideDeathScreen };
