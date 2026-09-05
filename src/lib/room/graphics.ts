import * as THREE from 'three';

interface BookRecord { content: { source: string }; pos: THREE.Vector3; scale: THREE.Vector3; rotY: number; lean: number }
interface LibraryScene {
  scene: THREE.Scene; books: THREE.InstancedMesh; bookMeta: BookRecord[];
  matWood: THREE.MeshStandardMaterial; matStone: THREE.MeshStandardMaterial;
  matBrass: THREE.MeshStandardMaterial; matWall: THREE.MeshStandardMaterial;
  shrineBook: THREE.Mesh; shrineGroup: THREE.Group;
}

export function enrichLibrary({scene, books, bookMeta, matWood, matStone, matBrass, matWall, shrineBook, shrineGroup}: LibraryScene) {
  const anisotropy = 4;
  // An atlas gives each existing fragment its own binding while retaining one draw call.
  const atlas = document.createElement('canvas');
  atlas.width = 1024; atlas.height = 4096;
  const ctx = atlas.getContext('2d')!;
  const titles = bookMeta.slice(0, 242).map(book => book.content.source);
  titles.forEach((title, index) => {
    const x = (index % 16) * 64, y = Math.floor(index / 16) * 256;
    ctx.save(); ctx.translate(x, y);
    const grad = ctx.createLinearGradient(0, 0, 64, 0);
    grad.addColorStop(0, '#373431'); grad.addColorStop(0.16, '#b5aaa0');
    grad.addColorStop(0.48, '#ddd2c4'); grad.addColorStop(0.88, '#9c9084'); grad.addColorStop(1, '#342d26');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 64, 256);
    ctx.strokeStyle = 'rgba(245,232,195,.58)'; ctx.lineWidth = 1;
    ctx.strokeRect(9, 12, 46, 232);
    [27, 34, 219, 226].forEach(band => {
      ctx.fillStyle = '#51463a'; ctx.fillRect(1, band + 2, 62, 3);
      ctx.fillStyle = '#e8d6a9'; ctx.fillRect(1, band, 62, 2);
    });
    ctx.translate(32, 128); ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#302920'; ctx.fillRect(-79, -17, 158, 34);
    ctx.fillStyle = '#fff0c5'; ctx.font = '16px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(title, 0, 0, 147);
    ctx.restore();
  });
  const atlasMap = new THREE.CanvasTexture(atlas);
  atlasMap.colorSpace = THREE.SRGBColorSpace; atlasMap.anisotropy = anisotropy;
  const bookMat = books.material as THREE.MeshStandardMaterial;
  const tile = new Float32Array(books.count);
  for (let i = 0; i < tile.length; i++) tile[i] = i % 242;
  books.geometry.setAttribute('archiveTile', new THREE.InstancedBufferAttribute(tile, 1));
  bookMat.onBeforeCompile = shader => {
    shader.uniforms.archiveAtlas = { value: atlasMap };
    shader.vertexShader = 'attribute float archiveTile; varying float vArchiveTile; varying float vSpine;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvArchiveTile = archiveTile; vSpine = normal.x;');
    shader.fragmentShader = 'uniform sampler2D archiveAtlas; varying float vArchiveTile; varying float vSpine;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec4 binding;
        if (vSpine > 0.9) {
          vec2 cell = vec2(mod(vArchiveTile, 16.0), 15.0 - floor(vArchiveTile / 16.0));
          vec2 localUV = clamp(vMapUv, vec2(0.008), vec2(0.992));
          binding = texture2D(archiveAtlas, (cell + localUV) / 16.0);
        } else { binding = texture2D(map, vMapUv); }
        diffuseColor *= binding;
      #endif
    `);
  };
  bookMat.customProgramCacheKey = () => 'archive-bindings-v1';
  bookMat.needsUpdate = true;

  const pageCanvas = document.createElement('canvas'); pageCanvas.width = 128; pageCanvas.height = 128;
  const pctx = pageCanvas.getContext('2d')!;
  pctx.fillStyle = '#cbbd97'; pctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 2) { pctx.fillStyle = y % 6 ? '#b1a381' : '#ddcfad'; pctx.fillRect(0, y, 128, 1); }
  const pagesTexture = new THREE.CanvasTexture(pageCanvas); pagesTexture.colorSpace = THREE.SRGBColorSpace;
  const pagesMaterial = new THREE.MeshStandardMaterial({ map: pagesTexture, roughness: 0.94 });
  const pageEdges = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), pagesMaterial, books.count);
  const d = new THREE.Object3D(); d.rotation.order = 'YXZ';
  bookMeta.forEach((meta, i) => {
    d.position.copy(meta.pos); d.rotation.set(meta.lean, meta.rotY, 0);
    d.translateX(-0.009); d.translateY(meta.scale.y / 2 + 0.0015);
    d.scale.set(meta.scale.x * 0.82, 0.003, meta.scale.z * 0.79);
    d.updateMatrix(); pageEdges.setMatrixAt(i, d.matrix);
  });
  pageEdges.instanceMatrix.needsUpdate = true; scene.add(pageEdges);

  // Layered capitals, shelf lips and recessed ceiling bays give the room architectural scale.
  const apothem = 5 * Math.cos(Math.PI / 6);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const addBox = (w: number, h: number, depth: number, x: number, y: number, z: number, rotation: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.scale.set(w, h, depth);
    mesh.position.set(x, y, z); mesh.rotation.y = rotation;
    mesh.receiveShadow = true; scene.add(mesh); return mesh;
  };
  for (let wall = 0; wall < 6; wall++) {
    const a = wall * Math.PI / 3, nx = Math.cos(a), nz = Math.sin(a), rotation = Math.atan2(nx, nz);
    for (const [y, h, depth, material] of [[5.74, 0.09, 0.23, matStone], [5.88, 0.11, 0.31, matWood], [5.95, 0.035, 0.34, matBrass]] as const) {
      addBox(5, h, depth, nx * (apothem - 0.12), y, nz * (apothem - 0.12), rotation, material);
    }
    const corner = a + Math.PI / 6, cx = Math.cos(corner) * 4.82, cz = Math.sin(corner) * 4.82;
    addBox(0.18, 5.6, 0.18, cx, 2.8, cz, -corner, matStone);
    addBox(0.32, 0.18, 0.32, cx, 0.16, cz, -corner, matStone);
    addBox(0.28, 0.16, 0.28, cx, 5.55, cz, -corner, matStone);
    if ([1, 2, 4, 5].includes(wall)) {
      for (const sy of [0.55, 1.57, 2.59, 3.61, 4.63]) {
        addBox(4.0, 0.018, 0.025, nx * (apothem - 0.47), sy - 0.018, nz * (apothem - 0.47), rotation, matBrass);
      }
      for (const off of [-0.7, 0.7]) {
        const panel = addBox(1.12, 0.035, 1.28, nx * 3.08 - nz * off, 5.96, nz * 3.08 + nx * off, rotation, matWood);
        panel.material = matWood;
      }
    }
  }
  for (const material of [matWood, matStone, matWall]) {
    material.bumpMap = material.map; material.bumpScale = material === matWood ? 0.022 : 0.035; material.needsUpdate = true;
  }

  // Separate paper and covers make Plunkitt a physical volume rather than a textured cube.
  shrineBook.geometry = new THREE.BoxGeometry(0.34, 0.44, 0.014);
  shrineBook.position.z = 0.039;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.44, 0.014), (shrineBook.material as THREE.Material[])[0]);
  back.position.copy(shrineBook.position); back.position.z = -0.039; back.rotation.copy(shrineBook.rotation);
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.309, 0.411, 0.062), pagesMaterial);
  paper.position.copy(shrineBook.position); paper.position.z = 0; paper.rotation.copy(shrineBook.rotation);
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.041, 0.44, 16, 1, false, 0, Math.PI), (shrineBook.material as THREE.Material[])[0]);
  spine.position.copy(paper.position); spine.position.x = -0.156; spine.rotation.copy(paper.rotation); spine.rotation.y = Math.PI;
  for (const mesh of [back, paper, spine]) { mesh.castShadow = true; shrineGroup.add(mesh); }

  return { atlasMap, pageEdges };
}
