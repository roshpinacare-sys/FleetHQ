/**
 * director.js — מצלמת-הבמאי: נקודות-תצפית אדריכליות, מעבר חלק,
 * סיור אוטומטי מתוזמן, ומיקוד-דולי אחרי סוכן נבחר.
 */

import * as THREE from 'three';
import { OrbitControls } from '../assets/OrbitControls.js';
import { ROOM_W, ROOM_D } from './canon.js';

export const VIEWS = [
  { id: 'overview', he: 'מבט-על', pos: [7.4, 4.7, 5.1], target: [-0.6, 0.9, -0.9] },
  { id: 'flame', he: 'להבת-הריבונות', pos: [2.5, 1.6, 2.7], target: [0, 0.95, 0.56] },
  { id: 'taskwall', he: 'לוח-המשימות', pos: [0.4, 1.62, -2.7], target: [0, 1.6, -6.2] },
  { id: 'gitwall', he: 'קיר-הגיט', pos: [-3.1, 1.75, -1.9], target: [-6.1, 1.7, -6.2] },
  { id: 'podium', he: 'דוכן-ההחלטות', pos: [-2.3, 1.65, 1.1], target: [-6.3, 1.0, -0.9] },
  { id: 'library', he: 'הספרייה', pos: [2.5, 1.7, -0.3], target: [5.8, 1.0, -3.2] },
  { id: 'coffee', he: 'בר-הקפה', pos: [5.3, 1.75, 5.3], target: [8.4, 1.0, 3.5] },
  { id: 'arc', he: 'קשת-הצוות', pos: [2.9, 1.95, 4.3], target: [0, 0.9, 0.2] },
];

export class Director {
  constructor(camera, dom) {
    this.camera = camera;
    this.controls = new OrbitControls(camera, dom);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 1.1;
    this.controls.maxDistance = 13;
    this.controls.maxPolarAngle = Math.PI * 0.492;
    this.controls.target.set(-0.6, 0.9, -0.9);

    this.fly = null; // {p0,p1,t0,t1, q0..} מעבר חלק
    this.tour = false;
    this.tourIdx = 0;
    this.tourAt = 0;
    this.follow = null; // מזהה סוכן
    this.onView = null;
    this.userMoved = false;

    const cancel = () => { this.userMoved = true; this.stopTour(); };
    dom.addEventListener('pointerdown', cancel);
    dom.addEventListener('wheel', cancel, { passive: true });
  }

  stopTour() { this.tour = false; if (this.onView) this.onView(null); }

  startTour() {
    this.tour = true;
    this.tourAt = 0;
    this.userMoved = false;
    this.goView(VIEWS[this.tourIdx % VIEWS.length], { announce: true });
  }

  goView(v, { announce = true } = {}) {
    this.follow = null;
    const p1 = new THREE.Vector3(...v.pos);
    const t1 = new THREE.Vector3(...v.target);
    this.flyTo(p1, t1);
    if (announce && this.onView) this.onView(v);
  }

  goViewIndex(i) {
    this.tourIdx = ((i % VIEWS.length) + VIEWS.length) % VIEWS.length;
    this.goView(VIEWS[this.tourIdx]);
  }

  flyTo(p1, t1, dur = 1.7) {
    const p0 = this.camera.position.clone();
    const t0 = this.controls.target.clone();
    this.fly = { p0, p1, t0, t1, age: 0, dur };
  }

  focusAgent(agent) {
    this.stopTour();
    this.follow = agent.id;
    this.followAgent = agent;
    const head = agent.headPos(new THREE.Vector3());
    // מצלמה מאחורי-צד הסוכן, בגובה-פנים
    const back = new THREE.Vector3(Math.sin(agent.face), 0, Math.cos(agent.face)).multiplyScalar(-2.6);
    const p1 = new THREE.Vector3(head.x + back.x, head.y + 0.55, head.z + back.z);
    this.flyTo(p1, head.clone().add(new THREE.Vector3(0, 0.05, 0)), 1.3);
  }

  unfocus() {
    this.follow = null;
    this.goViewIndex(0);
  }

  update(dt) {
    if (this.fly) {
      this.fly.age += dt;
      const k = Math.min(1, this.fly.age / this.fly.dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // easeInOutCubic
      this.camera.position.lerpVectors(this.fly.p0, this.fly.p1, e);
      this.controls.target.lerpVectors(this.fly.t0, this.fly.t1, e);
      if (k >= 1) this.fly = null;
    } else if (this.follow) {
      // עקיבה חיה אחרי הסוכן
      const head = this.followAgent ? this.followAgent.headPos(new THREE.Vector3()) : null;
      if (head) {
        const want = new THREE.Vector3(
          head.x - Math.sin(this.followAgent.face) * 2.6,
          head.y + 0.55,
          head.z - Math.cos(this.followAgent.face) * 2.6,
        );
        this.camera.position.lerp(want, 1 - Math.exp(-2.2 * dt));
        this.controls.target.lerp(head, 1 - Math.exp(-3.5 * dt));
      }
    }
    if (this.tour && !this.fly) {
      this.tourAt += dt;
      if (this.tourAt > 11) {
        this.tourAt = 0;
        this.tourIdx = (this.tourIdx + 1) % VIEWS.length;
        this.goView(VIEWS[this.tourIdx]);
      }
    }
    // תחום-החדר: המצלמה לעולם לא יוצאת מהקירות
    const P = this.camera.position;
    P.x = Math.min(9.5, Math.max(-9.5, P.x));
    P.z = Math.min(5.9, Math.max(-5.9, P.z));
    P.y = Math.min(3.35, Math.max(0.35, P.y));
    this.controls.update();
  }
}
