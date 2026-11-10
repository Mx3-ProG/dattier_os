import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { geoContains, geoEquirectangular, geoGraticule10, geoPath } from "d3-geo";
import { countryGeo } from "@/features/analytics/country-geo";
import {
  clusterCell,
  clusterPoints,
  latLngToVector,
  vectorToLatLng,
  angularDistance,
  type GlobeCluster,
  type GlobePoint,
} from "@/features/analytics/cluster";
import { loadWorldFeatures } from "./assets";
import type { GlobeEngineFactory, GlobeHandle } from "./types";

const palette = {
  oceanTop: "#071a33",
  oceanMid: "#0b2747",
  land: "#2f8f83",
  landEdge: "#a8f0dd",
  border: "rgba(7,26,51,.75)",
  grid: "rgba(150,210,255,.07)",
  marker: new THREE.Color("#ffc86b"),
  markerHot: new THREE.Color("#fff2d0"),
  atmosphere: new THREE.Color("#56b6ff"),
};
const numericToAlpha = new Map(Object.entries(countryGeo).map(([alpha, entry]) => [entry[0], alpha]));
const toVector = (lat: number, lng: number, radius = 1) => {
  const [x, y, z] = latLngToVector(lat, lng);
  return new THREE.Vector3(x * radius, y * radius, z * radius);
};

function paintEarth(world: GeoJSON.FeatureCollection, width: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = width / 2;
  const context = canvas.getContext("2d")!;
  const ocean = context.createLinearGradient(0, 0, 0, canvas.height);
  ocean.addColorStop(0, palette.oceanTop);
  ocean.addColorStop(0.5, palette.oceanMid);
  ocean.addColorStop(1, palette.oceanTop);
  context.fillStyle = ocean;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const projection = geoEquirectangular()
    .scale(width / (2 * Math.PI))
    .translate([width / 2, width / 4])
    .precision(0.3);
  const path = geoPath(projection, context);
  const scale = width / 2048;
  context.beginPath();
  path(geoGraticule10());
  context.strokeStyle = palette.grid;
  context.lineWidth = scale;
  context.stroke();
  // Halo côtier, puis terres, puis frontières : les continents se détachent sans texture photo.
  context.save();
  context.shadowColor = palette.landEdge;
  context.shadowBlur = 10 * scale;
  context.beginPath();
  path(world);
  context.fillStyle = palette.land;
  context.fill();
  context.restore();
  context.beginPath();
  for (const feature of world.features) path(feature);
  context.strokeStyle = palette.border;
  context.lineWidth = 1.1 * scale;
  context.stroke();
  return canvas;
}

const glowVertex = `
  attribute float aPhase;
  varying vec2 vUv;
  varying float vPhase;
  void main() {
    vUv = uv;
    vPhase = aPhase;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }`;
const glowFragment = `
  uniform vec3 uColor;
  uniform vec3 uHot;
  uniform float uTime;
  varying vec2 vUv;
  varying float vPhase;
  void main() {
    float d = distance(vUv, vec2(0.5)) * 2.0;
    if (d > 1.0) discard;
    float breathing = 0.82 + 0.18 * sin(uTime * 1.6 + vPhase * 6.283);
    float core = smoothstep(0.26, 0.0, d);
    float halo = pow(1.0 - d, 2.2) * 0.6 * breathing;
    gl_FragColor = vec4(mix(uColor, uHot, core), core + halo);
  }`;
const atmosphereVertex = `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const atmosphereFragment = `
  uniform vec3 uColor;
  varying vec3 vNormal;
  void main() {
    float intensity = pow(max(0.0, 0.66 - dot(vNormal, vec3(0.0, 0.0, 1.0))), 3.2);
    gl_FragColor = vec4(uColor, intensity);
  }`;
const rimFragment = `
  uniform vec3 uColor;
  varying vec3 vNormal;
  void main() {
    float rim = pow(1.0 - max(0.0, dot(vNormal, vec3(0.0, 0.0, 1.0))), 3.5);
    gl_FragColor = vec4(uColor, rim * 0.55);
  }`;

const MAX_MARKERS = 400;
const PULSE_COUNT = 12;
const PULSE_SECONDS = 1.8;

export const createThreeGlobe: GlobeEngineFactory = async (options) => {
  const { container, reducedMotion, lowPower, assets } = options;
  const world = await loadWorldFeatures(!lowPower);
  const renderer = new THREE.WebGLRenderer({ antialias: !lowPower, alpha: true, powerPreference: lowPower ? "low-power" : "default" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.style.display = "block";
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  // France de face à l’ouverture : la majorité des établissements y sont.
  camera.position.copy(toVector(28, 8, 3.4));

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.6;
  controls.minDistance = 1.35;
  controls.maxDistance = 6;
  controls.autoRotateSpeed = 0.35;
  controls.autoRotate = options.autoRotate && !reducedMotion;
  let wantsAutoRotate = options.autoRotate && !reducedMotion;

  const maxTexture = renderer.capabilities.maxTextureSize;
  const textureWidth = Math.min(lowPower ? 2048 : 4096, maxTexture);
  let earthTexture: THREE.Texture = new THREE.CanvasTexture(paintEarth(world, textureWidth));
  earthTexture.colorSpace = THREE.SRGBColorSpace;
  earthTexture.anisotropy = Math.min(lowPower ? 2 : 8, renderer.capabilities.getMaxAnisotropy());
  const segments = lowPower ? 64 : 96;
  const earthGeometry = new THREE.SphereGeometry(1, segments, Math.round(segments * 0.66));
  const earthMaterial = new THREE.MeshPhongMaterial({
    map: earthTexture,
    shininess: 14,
    specular: new THREE.Color("#1c3b5a"),
  });
  const earth = new THREE.Mesh(earthGeometry, earthMaterial);
  scene.add(earth);
  if (assets.earthTextureUrl) {
    new THREE.TextureLoader().load(assets.earthTextureUrl, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = earthTexture.anisotropy;
      earthTexture.dispose();
      earthTexture = texture;
      earthMaterial.map = texture;
      earthMaterial.needsUpdate = true;
      dirty = true;
    });
  }
  scene.add(new THREE.AmbientLight(0xffffff, 2.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  camera.add(sun);
  sun.position.set(-1.4, 1.2, 2);
  scene.add(camera);

  const atmosphereGeometry = new THREE.SphereGeometry(1.16, 48, 32);
  const atmosphereMaterial = new THREE.ShaderMaterial({
    vertexShader: atmosphereVertex,
    fragmentShader: atmosphereFragment,
    uniforms: { uColor: { value: palette.atmosphere } },
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(atmosphereGeometry, atmosphereMaterial));
  const rimGeometry = new THREE.SphereGeometry(1.002, 48, 32);
  const rimMaterial = new THREE.ShaderMaterial({
    vertexShader: atmosphereVertex,
    fragmentShader: rimFragment,
    uniforms: { uColor: { value: palette.atmosphere } },
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(rimGeometry, rimMaterial));

  const starCount = lowPower ? 500 : 1400;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i += 1) {
    const direction = new THREE.Vector3().randomDirection().multiplyScalar(22 + Math.random() * 18);
    starPositions.set([direction.x, direction.y, direction.z], i * 3);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  const starMaterial = new THREE.PointsMaterial({
    color: 0xbcd4ff,
    size: lowPower ? 1 : 1.3,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });
  scene.add(new THREE.Points(starGeometry, starMaterial));

  // Marqueurs : une seule géométrie instanciée, donc un seul appel de dessin quel que soit le volume.
  const glowUniforms = { uColor: { value: palette.marker }, uHot: { value: palette.markerHot }, uTime: { value: 0 } };
  const glowGeometry = new THREE.PlaneGeometry(1, 1);
  const phases = new Float32Array(MAX_MARKERS);
  for (let i = 0; i < MAX_MARKERS; i += 1) phases[i] = (i * 0.618034) % 1;
  glowGeometry.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phases, 1));
  const glowMaterial = new THREE.ShaderMaterial({
    vertexShader: glowVertex,
    fragmentShader: glowFragment,
    uniforms: glowUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const glows = new THREE.InstancedMesh(glowGeometry, glowMaterial, MAX_MARKERS);
  glows.frustumCulled = false;
  glows.count = 0;
  scene.add(glows);
  const beamGeometry = new THREE.CylinderGeometry(0.0022, 0.0045, 1, 6, 1, true);
  beamGeometry.translate(0, 0.5, 0);
  const beamMaterial = new THREE.MeshBasicMaterial({
    color: palette.marker,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const beams = new THREE.InstancedMesh(beamGeometry, beamMaterial, MAX_MARKERS);
  beams.frustumCulled = false;
  beams.count = 0;
  scene.add(beams);

  const ringGeometry = new THREE.RingGeometry(0.86, 1, 40);
  const rings = Array.from({ length: PULSE_COUNT }, () => {
    const material = new THREE.MeshBasicMaterial({
      color: palette.markerHot,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(ringGeometry, material);
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, material, startedAt: -1 };
  });
  let nextRing = 0;

  let points: readonly GlobePoint[] = [];
  let clusters: GlobeCluster[] = [];
  let cell = -1;
  let dirty = true;
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const quaternion = new THREE.Quaternion();
  function rebuild() {
    clusters = clusterPoints(points, cell).slice(0, MAX_MARKERS);
    const heaviest = clusters.reduce((max, cluster) => Math.max(max, cluster.weight), 1);
    clusters.forEach((cluster, index) => {
      const ratio = Math.sqrt(cluster.weight / heaviest);
      const normal = toVector(cluster.lat, cluster.lng);
      dummy.position.copy(normal).multiplyScalar(1.004);
      dummy.lookAt(normal.clone().multiplyScalar(2));
      dummy.scale.setScalar(0.035 + 0.075 * ratio);
      dummy.updateMatrix();
      glows.setMatrixAt(index, dummy.matrix);
      quaternion.setFromUnitVectors(up, normal);
      dummy.quaternion.copy(quaternion);
      dummy.scale.set(1, 0.03 + 0.2 * ratio, 1);
      dummy.updateMatrix();
      beams.setMatrixAt(index, dummy.matrix);
    });
    glows.count = clusters.length;
    beams.count = clusters.length;
    glows.instanceMatrix.needsUpdate = true;
    beams.instanceMatrix.needsUpdate = true;
    dirty = true;
  }
  function recluster(force = false) {
    const next = clusterCell(camera.position.length());
    if (force || next !== cell) {
      cell = next;
      rebuild();
    }
  }

  // Taille adaptée au conteneur, y compris en plein écran.
  const resize = () => {
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    dirty = true;
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  // Survol et sélection : le rayon est calculé contre la sphère, sans parcourir de maillage.
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const sphere = new THREE.Sphere(new THREE.Vector3(), 1);
  const hit = new THREE.Vector3();
  function locate(event: PointerEvent) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.ray.intersectSphere(sphere, hit) ? vectorToLatLng(hit.x, hit.y, hit.z) : null;
  }
  function nearest(position: { lat: number; lng: number }) {
    if (!glows.visible) return null;
    const threshold = Math.max(cell * 0.6, 2.2);
    let found: GlobeCluster | null = null;
    let best = threshold;
    for (const cluster of clusters) {
      const distance = angularDistance(cluster, position);
      if (distance <= best) {
        best = distance;
        found = cluster;
      }
    }
    return found;
  }
  function countryAt(position: { lat: number; lng: number }) {
    const feature = world.features.find((candidate) => geoContains(candidate, [position.lng, position.lat]));
    return feature?.id !== undefined ? (numericToAlpha.get(String(feature.id)) ?? null) : null;
  }
  let down: { x: number; y: number } | null = null;
  let hoverFrame = 0;
  const onPointerDown = (event: PointerEvent) => {
    down = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: PointerEvent) => {
    const start = down;
    down = null;
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
    const position = locate(event);
    if (position) options.onSelect({ cluster: nearest(position), country: countryAt(position), ...position });
  };
  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === "touch" || down || hoverFrame) return;
    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = 0;
      const position = locate(event);
      const cluster = position ? nearest(position) : null;
      controls.autoRotate = wantsAutoRotate && !cluster;
      renderer.domElement.style.cursor = cluster ? "pointer" : "grab";
      const rect = container.getBoundingClientRect();
      options.onHover(cluster ? { cluster, x: event.clientX - rect.left, y: event.clientY - rect.top } : null);
    });
  };
  const onPointerLeave = () => {
    controls.autoRotate = wantsAutoRotate;
    options.onHover(null);
  };
  const onContextLost = (event: Event) => {
    event.preventDefault();
    options.onContextLost();
  };
  const canvas = renderer.domElement;
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("webglcontextlost", onContextLost);
  controls.addEventListener("change", () => {
    dirty = true;
  });

  // La boucle s’arrête hors de l’écran ou onglet masqué : ni GPU ni batterie consommés pour rien.
  let visible = true;
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    schedule();
  });
  intersection.observe(container);
  const onVisibility = () => schedule();
  document.addEventListener("visibilitychange", onVisibility);
  let frame = 0;
  let disposed = false;
  let focusTween: { from: THREE.Vector3; to: THREE.Vector3; startedAt: number } | null = null;
  const clock = new THREE.Clock();
  function schedule() {
    if (!frame && !disposed && visible && !document.hidden) frame = requestAnimationFrame(tick);
  }
  function tick() {
    frame = 0;
    if (disposed || !visible || document.hidden) return;
    const elapsed = clock.getElapsedTime();
    if (focusTween) {
      const t = Math.min(1, (elapsed - focusTween.startedAt) / 0.9);
      const eased = t * t * (3 - 2 * t);
      const distance = camera.position.length();
      camera.position
        .copy(focusTween.from)
        .lerp(focusTween.to, eased)
        .normalize()
        .multiplyScalar(distance);
      if (t >= 1) focusTween = null;
      dirty = true;
    }
    controls.update();
    recluster();
    let animating = !reducedMotion || !!focusTween;
    for (const ring of rings) {
      if (ring.startedAt < 0) continue;
      const t = (elapsed - ring.startedAt) / PULSE_SECONDS;
      if (t >= 1) {
        ring.startedAt = -1;
        ring.mesh.visible = false;
        dirty = true;
        continue;
      }
      ring.mesh.scale.setScalar(0.02 + 0.2 * t);
      ring.material.opacity = (1 - t) * 0.9;
      animating = true;
      dirty = true;
    }
    if (!reducedMotion) glowUniforms.uTime.value = elapsed;
    if (dirty || !reducedMotion) {
      renderer.render(scene, camera);
      dirty = false;
    }
    // Mouvements réduits : plus de boucle continue, seules les interactions déclenchent un rendu.
    if (animating) schedule();
    else if (reducedMotion) idleTimer = window.setTimeout(schedule, 120);
  }
  let idleTimer = 0;
  schedule();

  const handle: GlobeHandle = {
    setPoints(next) {
      points = next;
      recluster(true);
    },
    pulse(lat, lng) {
      if (reducedMotion) return;
      const ring = rings[nextRing];
      nextRing = (nextRing + 1) % PULSE_COUNT;
      const normal = toVector(lat, lng);
      ring.mesh.position.copy(normal).multiplyScalar(1.006);
      ring.mesh.lookAt(normal.clone().multiplyScalar(2));
      ring.mesh.visible = true;
      ring.startedAt = clock.getElapsedTime();
      schedule();
    },
    setAutoRotate(enabled) {
      wantsAutoRotate = enabled && !reducedMotion;
      controls.autoRotate = wantsAutoRotate;
    },
    setMarkersVisible(show) {
      glows.visible = show;
      beams.visible = show;
      dirty = true;
    },
    focus(lat, lng) {
      const distance = camera.position.length();
      const to = toVector(lat, lng, distance);
      wantsAutoRotate = false;
      controls.autoRotate = false;
      if (reducedMotion) {
        camera.position.copy(to);
        dirty = true;
        return;
      }
      focusTween = { from: camera.position.clone(), to, startedAt: clock.getElapsedTime() };
    },
    zoomBy(factor) {
      const distance = Math.min(controls.maxDistance, Math.max(controls.minDistance, camera.position.length() * factor));
      camera.position.setLength(distance);
      dirty = true;
    },
    rotateBy(degrees) {
      camera.position.applyAxisAngle(up, (degrees * Math.PI) / 180);
      dirty = true;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(hoverFrame);
      clearTimeout(idleTimer);
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      controls.dispose();
      for (const ring of rings) ring.material.dispose();
      ringGeometry.dispose();
      earthGeometry.dispose();
      earthMaterial.dispose();
      earthTexture.dispose();
      atmosphereGeometry.dispose();
      atmosphereMaterial.dispose();
      rimGeometry.dispose();
      rimMaterial.dispose();
      starGeometry.dispose();
      starMaterial.dispose();
      glowGeometry.dispose();
      glowMaterial.dispose();
      glows.dispose();
      beamGeometry.dispose();
      beamMaterial.dispose();
      beams.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
  return handle;
};
