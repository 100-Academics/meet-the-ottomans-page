import './style.css'
import { setupApp } from './App'

document.querySelector<HTMLDivElement>('#root')!.innerHTML = `
  <div>
    <canvas id="application-canvas"></canvas>
    <div class="absolute overlay">
    </div>
  </div>
`

const onClickStuff = () => {
  // Click handler - managed in scenes
}





void await setupApp(document.getElementById('application-canvas') as HTMLCanvasElement, onClickStuff, () => -1);
