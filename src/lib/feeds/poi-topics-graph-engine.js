import * as d3 from 'd3'

const config = {
  title: 'Topic map',
  subtitle: 'POIs, topics, and their relationships',
  info: ' Drag POIs to pin (double-click to unpin). Shift+drag or scroll-wheel to pan/zoom. Click a topic to browse its posts.',
  showPoiControls: true,
  labelTypes: ['poi', 'topic'],
}

export function mountPoiTopicsGraph(container, graphData, options = {}) {
  const noopApi = { destroy() {}, clearSelection() {} }
  if (!container || !graphData) {
    return noopApi
  }

  const { onSelectNode = null } = options

  const fg = (name) => container.querySelector(`[data-fg="${name}"]`)

    const POST_RADIUS = 2;
    const HIDDEN_COORD = -9999;
    const POI_CONFIG_KEY = "overwatch-feeds-poi-tiers";
    const LAYOUT_TUNING_KEY = "overwatch-feeds-layout-tuning";

    const DEFAULT_LAYOUT = {
      poiRepel: 500,
      topicRepel: 50,
      postRepel: 5,
      poiTopicAttract: 0.1,
      postTopicAttract: 1,
      collideStrength: 0.1,
      collideIterations: 3,
      collisionScale: 1.2,
      repelDistanceMax: 100,
      gravity: 0.05,
      poiLinkBase: 8,
      poiLinkWeightBonus: 0,
      topicFanStep: 4,
      topicInitRadius: 6,
      postLinkDistance: 8,
      labelCharW: 2,
      labelCharWTopic: 2.8,
      labelH: 10,
      labelHTopic: 8,
      labelPad: 1,
      labelPadTopic: 1,
      topicLabelZoomPct: 160,
      alphaDecay: 0.028,
      velocityDecay: 0.48,
    };

    let layoutTuning = { ...DEFAULT_LAYOUT };
    let shouldAutoFit = true;

    const PLATFORM_COLORS = {
      X: "#1d4ed8",
      Instagram: "#db2777",
      YouTube: "#dc2626",
      Facebook: "#2563eb",
      Reddit: "#ea580c",
      Unknown: "#94a3b8",
    };

    const state = {
      data: null,
      nodes: [],
      links: [],
      transform: d3.zoomIdentity,
      baselineZoom: 1,
      selectedId: null,
      hoveredId: null,
      showPosts: false,
      showLabels: true,
      postsClickable: true,
      highlightAi: false,
      platformFilter: "",
      recurrenceFilter: new Set(),
      primaryPois: new Set(),
      secondaryPois: new Set(),
      selectedPois: new Set(),
      searchQuery: "",
      neighborhoodIds: null,
      neighborhoodLinkKeys: null,
      quadtree: null,
      simulation: null,
      draggingNode: null,
      dragActive: false,
      dragOffset: { x: 0, y: 0 },
      pointerDown: null,
      radiusScales: null,
      nodeById: new Map(),
      resizeObserver: null,
      lastHoverRender: 0,
      searchDebounceTimer: null,
    };

    let canvas, ctx, width, height, zoomBehavior;
    const DRAG_THRESHOLD = 4;

    function setupPageChrome() {
      const infoBox = fg("info-box");
      if (infoBox) {
        infoBox.innerHTML = `<strong>Interactions</strong>${config.info}`;
      }
      const poiControls = fg("poi-controls");
      if (poiControls) {
        poiControls.style.display = config.showPoiControls ? "block" : "none";
      }

      const legend = fg("legend");
      if (!legend) return;
      legend.innerHTML = "";
      if (config.showPoiControls) {
        legend.innerHTML += `
          <div class="legend-item"><div class="legend-dot lg" style="background:var(--node-poi)"></div> POI (by mention volume)</div>`;
      }
      legend.innerHTML += `
        <div class="legend-item"><div class="legend-dot" style="background:#3b82f6"></div> Active topic</div>
        <div class="legend-item"><div class="legend-dot" style="background:#8b5cf6"></div> Passive topic</div>`;

      const hint = fg("graph-hint");
      if (hint && config.showPoiControls) {
        hint.textContent = "Drag POI to pin · Double-click POI to unpin · Shift+drag to pan over nodes · Scroll to zoom";
      } else if (hint) {
        hint.textContent = "Drag topics · Scroll to zoom · Zoom % shown bottom-left";
      }
    }

    function loadLayoutTuning() {
      const saved = localStorage.getItem(LAYOUT_TUNING_KEY);
      if (saved) {
        try {
          layoutTuning = { ...DEFAULT_LAYOUT, ...JSON.parse(saved) };
        } catch (_) {
          layoutTuning = { ...DEFAULT_LAYOUT };
        }
      }
    }

    function saveLayoutTuning() {
      localStorage.setItem(LAYOUT_TUNING_KEY, JSON.stringify(layoutTuning));
    }

    function getZoomPercent(k = state.transform.k) {
      const base = state.baselineZoom || 1;
      return (k / base) * 100;
    }

    function topicLabelThresholdK() {
      const base = state.baselineZoom || 1;
      return base * (layoutTuning.topicLabelZoomPct / 100);
    }

    function updateZoomDisplay() {
      const el = fg("zoom-percent");
      if (!el) return;
      const pct = getZoomPercent();
      el.textContent = `${Math.round(pct)}%`;
      el.title = `Zoom relative to Fit (100%). Topic labels from ${layoutTuning.topicLabelZoomPct}%`;
    }

    function syncLayoutPanel() {
      const panel = fg("layout-tuning-panel");
      if (!panel) return;
      panel.querySelectorAll("input[type=range]").forEach((input) => {
        const key = input.id.replace("lt-", "");
        if (layoutTuning[key] !== undefined) input.value = layoutTuning[key];
      });
      panel.querySelectorAll(".val").forEach((el) => {
        const key = el.dataset.for;
        const v = layoutTuning[key];
        if (key === "topicLabelZoomPct") {
          el.textContent = `${v}%`;
        } else {
          el.textContent = typeof v === "number" && v % 1 !== 0 ? v.toFixed(2) : v;
        }
      });
    }

    function isValidGraphCoord(x, y) {
      return Number.isFinite(x) && Number.isFinite(y) && x > -5000 && y > -5000;
    }

    function nodeLabel(d) {
      if (d.type === "topic") return d.title || d.label || d.id;
      return d.id;
    }

    function isActiveTopic(d) {
      return d.type === "topic" && (d.topicType || "active") === "active";
    }

    function isPassiveTopic(d) {
      return d.type === "topic" && d.topicType === "passive";
    }

    function capturePinnedPois() {
      const pinned = new Map();
      state.nodes.filter((n) =>
        n.type === "poi" &&
        isPoiVisible(n.id) &&
        n.fx != null &&
        n.fy != null &&
        isValidGraphCoord(n.fx, n.fy)
      ).forEach((n) => {
        pinned.set(n.id, { fx: n.fx, fy: n.fy, x: n.x, y: n.y });
      });
      return pinned;
    }

    function restorePinnedPois(pinned) {
      pinned.forEach((pos, id) => {
        const n = state.nodes.find((x) => x.id === id);
        if (n) {
          n.x = pos.x;
          n.y = pos.y;
          n.fx = pos.fx;
          n.fy = pos.fy;
        }
      });
    }

    function getLayoutNodes() {
      return state.nodes.filter((n) => {
        if (n.type === "post" && !state.showPosts) return false;
        return (n.type === "poi" || n.type === "topic" || n.type === "post") && isNodeVisible(n);
      });
    }

    function getFitNodes() {
      return getLayoutNodes().filter((n) => n.type !== "post");
    }

    function getGraphDimensions() {
      const wrap = fg("canvas-wrap");
      const w = wrap?.clientWidth || 0;
      const h = wrap?.clientHeight || 0;
      return {
        width: Math.max(w, 640),
        height: Math.max(h, 480),
      };
    }

    function buildTopicAnchorMap() {
      const anchors = new Map();
      for (const l of state.links) {
        if (l.type !== "poi_topic") continue;
        const poiId = typeof l.source === "object" ? l.source.id : l.source;
        const topicId = typeof l.target === "object" ? l.target.id : l.target;
        const topic = state.nodes.find((n) => n.id === topicId);
        if (!topic || !isActiveTopic(topic)) continue;
        if (!isPoiVisible(poiId)) continue;
        const prev = anchors.get(topicId);
        if (!prev || (l.weight || 0) > prev.weight) {
          anchors.set(topicId, { poiId, weight: l.weight || 0 });
        }
      }
      return anchors;
    }

    function rebuildRadiusScales() {
      const pois = state.nodes.filter((n) => n.type === "poi");
      const topics = state.nodes.filter((n) => n.type === "topic");
      const poiCounts = pois.map((p) => p.postCount || 1);
      const topicCounts = topics.map((t) => t.postCount || 1);
      const poiMin = d3.min(poiCounts) || 1;
      const poiMax = d3.max(poiCounts) || 1;
      const topicMin = d3.min(topicCounts) || 1;
      const topicMax = d3.max(topicCounts) || 1;
      state.radiusScales = {
        poiPrimary: d3.scaleSqrt().domain([poiMin, poiMax]).range([22, 40]),
        poiSecondary: d3.scaleSqrt().domain([poiMin, poiMax]).range([12, 22]),
        topicActive: d3.scaleSqrt().domain([topicMin, topicMax]).range([6, 18]),
        topicPassive: d3.scaleSqrt().domain([topicMin, topicMax]).range([4, 10]),
      };
    }

    function nodeRadius(d) {
      if (!state.radiusScales) rebuildRadiusScales();
      const scales = state.radiusScales;
      if (d.type === "poi") {
        const tier = getPoiTier(d.id);
        const scale = tier === "primary" ? scales.poiPrimary : scales.poiSecondary;
        return scale(d.postCount || 1);
      }
      if (d.type === "topic") {
        const scale = isPassiveTopic(d) ? scales.topicPassive : scales.topicActive;
        return scale(d.postCount || 1);
      }
      return POST_RADIUS;
    }

    function labelTextLength(d) {
      const text = nodeLabel(d);
      const max = d.type === "poi" ? 22 : d.type === "topic" ? 36 : 0;
      return Math.min(text.length, max);
    }

    function nodeCollisionRadius(d) {
      if (!isNodeVisible(d)) return 0;
      const t = layoutTuning;
      const r = nodeRadius(d);
      if (d.type === "post") return (r + 3) * t.collisionScale;
      const pad = d.type === "topic" ? 4 : 8;
      return (r + pad) * t.collisionScale;
    }

    function simulationCollisionRadius(d) {
      if (!isNodeVisible(d)) return 0;
      if (d.type === "post") return nodeCollisionRadius(d);
      const withLabel = collisionRadius(d);
      return Math.max(withLabel, nodeCollisionRadius(d));
    }

    function collisionRadius(d) {
      if (!isNodeVisible(d)) return 0;
      if (d.type === "post") return 0;
      const t = layoutTuning;
      const r = nodeRadius(d);
      const showLabel = shouldShowLabel(d);
      if (!showLabel) return nodeCollisionRadius(d);
      const labelLen = labelTextLength(d);
      const charW = d.type === "topic" ? t.labelCharWTopic : t.labelCharW;
      const labelHalfW = (labelLen * charW) / 2;
      const labelH = d.type === "topic" ? t.labelHTopic : t.labelH;
      const pad = d.type === "topic" ? t.labelPadTopic : t.labelPad;
      return (r + labelHalfW + labelH + pad) * t.collisionScale;
    }

    function countTopicsPerPoi() {
      const counts = new Map();
      for (const l of state.links) {
        if (l.type !== "poi_topic") continue;
        const poiId = typeof l.source === "object" ? l.source.id : l.source;
        const topicId = typeof l.target === "object" ? l.target.id : l.target;
        if (!isPoiVisible(poiId)) continue;
        const topic = state.nodes.find((n) => n.id === topicId);
        if (!topic || !isActiveTopic(topic) || !isNodeVisible(topic)) continue;
        counts.set(poiId, (counts.get(poiId) || 0) + 1);
      }
      return counts;
    }

    function activeLinks() {
      const layoutIds = new Set(getLayoutNodes().map((n) => n.id));
      return state.links.filter((l) => {
        const s = typeof l.source === "object" ? l.source.id : l.source;
        const t = typeof l.target === "object" ? l.target.id : l.target;
        return layoutIds.has(s) && layoutIds.has(t);
      });
    }

    function simulationLinks() {
      return activeLinks();
    }

    function seedPostPositions(cx, cy) {
      const t = layoutTuning;
      const topicById = new Map(
        state.nodes.filter((n) => n.type === "topic").map((n) => [n.id, n])
      );
      const postCountByTopic = new Map();

      state.nodes.filter((n) => n.type === "post").forEach((post) => {
        if (!isNodeVisible(post)) {
          post.x = cx;
          post.y = cy;
          return;
        }
        const topic = topicById.get(post.topic);
        if (!topic || !Number.isFinite(topic.x)) {
          post.x = cx + (Math.random() - 0.5) * 80;
          post.y = cy + (Math.random() - 0.5) * 80;
          return;
        }
        const idx = postCountByTopic.get(post.topic) || 0;
        postCountByTopic.set(post.topic, idx + 1);
        const topicR = nodeRadius(topic);
        const angle = (idx * 2.399963) % (Math.PI * 2);
        const r = topicR + t.postLinkDistance + POST_RADIUS + 6;
        post.x = topic.x + Math.cos(angle) * r;
        post.y = topic.y + Math.sin(angle) * r;
      });
    }

    function isDraggableNode(d) {
      if (!d) return false;
      return d.type === "poi";
    }

    function isPinnedPoi(d) {
      return d.type === "poi" && d.fx != null && d.fy != null;
    }

    function poiTopicLinkDistance(l, topicsPerPoi) {
      const t = layoutTuning;
      const poiId = typeof l.source === "object" ? l.source.id : l.source;
      const fan = topicsPerPoi.get(poiId) || 1;
      const fanSpread = Math.sqrt(fan) * t.topicFanStep;
      return t.poiLinkBase + fanSpread + t.poiLinkWeightBonus / Math.sqrt(l.weight || 1);
    }

    function typeRepel(strengthMag, predicate) {
      const f = d3.forceManyBody()
        .strength(-strengthMag)
        .distanceMax(layoutTuning.repelDistanceMax)
        .theta(0.9);
      const base = f.initialize;
      f.initialize = (nodes, random) => base.call(f, nodes.filter(predicate), random);
      return f;
    }

    function applyLayoutForces() {
      if (!state.simulation) return;
      const t = layoutTuning;
      const topicsPerPoi = countTopicsPerPoi();
      const dims = getGraphDimensions();
      const cx = dims.width / 2;
      const cy = dims.height / 2;

      state.simulation
        .alphaDecay(t.alphaDecay)
        .velocityDecay(t.velocityDecay)
        .force("link", d3.forceLink(simulationLinks())
          .id((d) => d.id)
          .distance((l) => {
            if (l.type === "poi_topic") return poiTopicLinkDistance(l, topicsPerPoi);
            if (l.type === "topic_parent") {
              const child = typeof l.source === "object" ? l.source : state.nodes.find((n) => n.id === l.source);
              const parent = typeof l.target === "object" ? l.target : state.nodes.find((n) => n.id === l.target);
              return (parent ? nodeRadius(parent) : 0) + t.topicInitRadius + (child ? nodeRadius(child) : 0);
            }
            if (l.type === "post_link") {
              const topic = typeof l.source === "object" ? l.source : state.nodes.find((n) => n.id === l.source);
              return (topic ? nodeRadius(topic) : 0) + t.postLinkDistance + POST_RADIUS;
            }
            return t.poiLinkBase;
          })
          .strength((l) => {
            if (l.type === "poi_topic") return t.poiTopicAttract;
            if (l.type === "topic_parent") return t.poiTopicAttract * 0.9;
            if (l.type === "post_link") return t.postTopicAttract;
            return t.poiTopicAttract;
          }))
        .force("repelPoi", typeRepel(t.poiRepel, (d) => d.type === "poi"))
        .force("repelTopic", typeRepel(t.topicRepel, (d) => d.type === "topic"))
        .force("repelPost", typeRepel(t.postRepel, (d) => d.type === "post"))
        .force("collision", d3.forceCollide()
          .radius((d) => simulationCollisionRadius(d))
          .strength(t.collideStrength)
          .iterations(t.collideIterations))
        .force("x", d3.forceX(cx).strength(t.gravity))
        .force("y", d3.forceY(cy).strength(t.gravity));
    }

    function getLinkedTopicsForPoi(poiId) {
      return state.links
        .filter((l) => {
          if (l.type !== "poi_topic") return false;
          const src = typeof l.source === "object" ? l.source.id : l.source;
          return src === poiId;
        })
        .map((l) => {
          const topicId = typeof l.target === "object" ? l.target.id : l.target;
          return state.nodes.find((n) => n.id === topicId);
        })
        .filter((n) => n && isActiveTopic(n) && isNodeVisible(n) && isValidGraphCoord(n.x, n.y));
    }

    function seedPoiNearTopics(poi, cx, cy) {
      const topics = getLinkedTopicsForPoi(poi.id);
      if (!topics.length) return false;
      poi.x = d3.mean(topics, (t) => t.x) + (Math.random() - 0.5) * 80;
      poi.y = d3.mean(topics, (t) => t.y) + (Math.random() - 0.5) * 80;
      return true;
    }

    function restartLayoutSimulation(alpha = 0.85) {
      rebuildSimulation(alpha);
    }

    function seedNodePositions(pinned = new Map()) {
      const dims = getGraphDimensions();
      width = dims.width;
      height = dims.height;
      const cx = width / 2;
      const cy = height / 2;
      const t = layoutTuning;

      state.nodes.forEach((n) => {
        if (n.type === "poi" && pinned.has(n.id)) return;
        if (n.type === "poi" || n.type === "topic" || n.type === "post") {
          n.fx = null;
          n.fy = null;
          n.vx = 0;
          n.vy = 0;
        }
      });

      const pois = state.nodes.filter((n) => n.type === "poi" && isNodeVisible(n));
      const hiddenPois = state.nodes.filter((n) => n.type === "poi" && !isNodeVisible(n));
      const topics = state.nodes.filter((n) => n.type === "topic");

      hiddenPois.forEach((n) => {
        if (!pinned.has(n.id)) {
          n.x = HIDDEN_COORD;
          n.y = HIDDEN_COORD;
          n.fx = null;
          n.fy = null;
        }
      });

      const poiById = new Map();
      const poiRing = Math.min(width, height) * 0.28;

      if (config.showPoiControls && pois.length) {
        pois.forEach((p, i) => {
          if (pinned.has(p.id)) return;
          const needsReposition = !isValidGraphCoord(p.x, p.y);
          if (needsReposition && seedPoiNearTopics(p, cx, cy)) {
            poiById.set(p.id, p);
            return;
          }
          if (!needsReposition) {
            poiById.set(p.id, p);
            return;
          }
          const angle = (i / pois.length) * 2 * Math.PI - Math.PI / 2;
          p.x = cx + poiRing * Math.cos(angle);
          p.y = cy + poiRing * Math.sin(angle);
          poiById.set(p.id, p);
        });
        pois.forEach((p) => {
          if (pinned.has(p.id)) poiById.set(p.id, p);
        });
      }

      const topicAnchors = buildTopicAnchorMap();
      const topicTotalsByAnchor = new Map();
      const topicCountByAnchor = new Map();

      topics.forEach((topic) => {
        if (!isNodeVisible(topic) || isPassiveTopic(topic)) return;
        if (config.showPoiControls) {
          const anchorId = topicAnchors.get(topic.id)?.poiId || topic.anchorPoi;
          const anchor = anchorId ? poiById.get(anchorId) : null;
          const key = anchor ? anchor.id : "__free__";
          topicTotalsByAnchor.set(key, (topicTotalsByAnchor.get(key) || 0) + 1);
        }
      });

      topics.forEach((topic) => {
        if (!isNodeVisible(topic) || isPassiveTopic(topic)) return;
        if (config.showPoiControls) {
          const anchorId = topicAnchors.get(topic.id)?.poiId || topic.anchorPoi;
          const anchor = anchorId ? poiById.get(anchorId) : null;
          const key = anchor ? anchor.id : "__free__";
          const idx = topicCountByAnchor.get(key) || 0;
          topicCountByAnchor.set(key, idx + 1);
          const total = topicTotalsByAnchor.get(key) || 1;
          const angle = (idx / total) * 2 * Math.PI - Math.PI / 2;
          const ring = Math.floor(idx / 8);
          const r = t.topicInitRadius + ring * t.topicFanStep + nodeRadius(topic);
          if (anchor) {
            topic.x = anchor.x + r * Math.cos(angle);
            topic.y = anchor.y + r * Math.sin(angle);
          } else {
            topic.x = cx + (Math.random() - 0.5) * 120;
            topic.y = cy + (Math.random() - 0.5) * 120;
          }
        } else {
          const visibleTopics = topics.filter(isNodeVisible);
          const idx = visibleTopics.indexOf(topic);
          const angle = (idx / Math.max(visibleTopics.length, 1)) * 2 * Math.PI - Math.PI / 2;
          const r = Math.min(width, height) * 0.22;
          topic.x = cx + r * Math.cos(angle);
          topic.y = cy + r * Math.sin(angle);
        }
      });

      restorePinnedPois(pinned);

      const passiveByParent = new Map();
      topics.filter((t) => isPassiveTopic(t) && isNodeVisible(t)).forEach((topic) => {
        const key = topic.parentTopicId || "__orphan__";
        if (!passiveByParent.has(key)) passiveByParent.set(key, []);
        passiveByParent.get(key).push(topic);
      });

      passiveByParent.forEach((children, parentId) => {
        const parent = topics.find((t) => t.id === parentId);
        if (!parent || !isValidGraphCoord(parent.x, parent.y)) return;
        children.forEach((topic, idx) => {
          const total = children.length;
          const angle = (idx / total) * 2 * Math.PI - Math.PI / 2;
          const ring = Math.floor(idx / 8);
          const r = t.topicInitRadius + ring * t.topicFanStep + nodeRadius(parent) + nodeRadius(topic);
          topic.x = parent.x + r * Math.cos(angle);
          topic.y = parent.y + r * Math.sin(angle);
        });
      });

      seedPostPositions(cx, cy);
    }

    function loadPoiTiers() {
      if (!config.showPoiControls || !state.data.poiConfig) return;
      const saved = localStorage.getItem(POI_CONFIG_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          state.primaryPois = new Set(parsed.primary || []);
          state.secondaryPois = new Set(parsed.secondary || []);
          state.selectedPois = new Set(parsed.selected || parsed.primary || []);
          return;
        } catch (_) {
          /* fall through to defaults */
        }
      }
      const cfg = state.data.poiConfig;
      state.primaryPois = new Set(cfg.primary);
      state.secondaryPois = new Set(cfg.secondary);
      state.selectedPois = new Set(cfg.selected || cfg.primary);
    }

    function savePoiTiers() {
      localStorage.setItem(POI_CONFIG_KEY, JSON.stringify({
        primary: [...state.primaryPois],
        secondary: [...state.secondaryPois],
        selected: [...state.selectedPois],
      }));
    }

    function isPoiVisible(poiId) {
      return state.selectedPois.has(poiId);
    }

    function togglePoiSelected(poiId, checked) {
      if (checked) state.selectedPois.add(poiId);
      else state.selectedPois.delete(poiId);
      savePoiTiers();
      renderPoiConfig();
      renderMeta();
      refreshVisibility();
    }

    function selectAllPrimaryPois() {
      state.primaryPois.forEach((id) => state.selectedPois.add(id));
      savePoiTiers();
      renderPoiConfig();
      renderMeta();
      refreshVisibility();
    }

    function refreshVisibility() {
      const pinned = capturePinnedPois();
      seedNodePositions(pinned);
      restartLayoutSimulation(0.35);
    }

    function isSearchVisible(d) {
      if (!state.searchQuery) return true;
      const q = state.searchQuery.toLowerCase();
      if (d.id.toLowerCase().includes(q)) return true;
      if (d.type === "topic") {
        if ((d.title || "").toLowerCase().includes(q)) return true;
        if ((d.narrative || "").toLowerCase().includes(q)) return true;
      }
      if (d.type === "poi") {
        return state.links.some((l) => {
          if (l.type !== "poi_topic") return false;
          const src = typeof l.source === "object" ? l.source.id : l.source;
          const tgt = typeof l.target === "object" ? l.target.id : l.target;
          if (src !== d.id) return false;
          const topic = state.nodes.find((n) => n.id === tgt);
          return topic && nodeLabel(topic).toLowerCase().includes(q);
        });
      }
      if (d.type === "post") {
        const topic = state.nodes.find((n) => n.id === d.topic);
        return topic ? isSearchVisible(topic) : false;
      }
      return false;
    }

    function topicHasVisiblePoiLink(topicId) {
      return state.links.some((l) => {
        if (l.type !== "poi_topic") return false;
        const src = typeof l.source === "object" ? l.source.id : l.source;
        const tgt = typeof l.target === "object" ? l.target.id : l.target;
        return tgt === topicId && isPoiVisible(src);
      });
    }

    function isTopicNodeVisible(d) {
      if (isPassiveTopic(d)) {
        const parent = state.nodes.find((n) => n.id === d.parentTopicId);
        return parent ? isNodeVisible(parent) : false;
      }
      if (config.showPoiControls) return topicHasVisiblePoiLink(d.id);
      return true;
    }

    function isNodeVisible(d) {
      if (!isSearchVisible(d)) return false;
      if (d.type === "post") {
        if (!state.showPosts) return false;
        if (state.platformFilter && d.platform !== state.platformFilter) return false;
        const topic = state.nodes.find((n) => n.id === d.topic);
        if (topic && !isNodeVisible(topic)) return false;
        return true;
      }
      if (d.type === "topic") {
        return isTopicNodeVisible(d);
      }
      if (d.type === "poi") return isPoiVisible(d.id);
      return true;
    }

    function getPoiTier(poiId) {
      if (state.primaryPois.has(poiId)) return "primary";
      return "secondary";
    }

    function movePoi(poiId, toTier) {
      state.primaryPois.delete(poiId);
      state.secondaryPois.delete(poiId);
      if (toTier === "primary") state.primaryPois.add(poiId);
      else state.secondaryPois.add(poiId);
      savePoiTiers();
      renderPoiConfig();
      renderMeta();
      refreshVisibility();
    }

    function renderPoiConfig() {
      if (!config.showPoiControls || !state.data) return;
      const pois = state.data.nodes
        .filter((n) => n.type === "poi")
        .sort((a, b) => b.postCount - a.postCount);

      const allPois = pois.filter((p) =>
        state.primaryPois.has(p.id) || state.secondaryPois.has(p.id)
      );

      const selectedEl = fg("selected-poi-list");
      if (selectedEl) {
        selectedEl.innerHTML = allPois.map((p) => `
          <label class="poi-item poi-select-item">
            <input type="checkbox" data-poi-select="${escapeAttr(p.id)}" ${state.selectedPois.has(p.id) ? "checked" : ""} />
            <span class="name">${escapeHtml(p.id)}</span>
            <span class="count">${p.postCount}</span>
          </label>
        `).join("") || `<div class="poi-item" style="color:var(--text-muted)">None</div>`;

        selectedEl.querySelectorAll("input[data-poi-select]").forEach((input) => {
          input.addEventListener("change", () => togglePoiSelected(input.dataset.poiSelect, input.checked));
        });
      }

      const selectAllBtn = fg("select-all-primary-pois");
      if (selectAllBtn) {
        selectAllBtn.onclick = () => selectAllPrimaryPois();
      }

      function renderList(containerId, tier) {
        const list = tier === "primary" ? state.primaryPois : state.secondaryPois;
        const items = pois.filter((p) => list.has(p.id));
        const el = fg(containerId);
        if (!el) return;
        el.innerHTML = items.map((p) => `
          <div class="poi-item">
            <span class="tier-badge ${tier}">${tier === "primary" ? "1°" : "2°"}</span>
            <span class="name">${escapeHtml(p.id)}</span>
            <span class="count">${p.postCount}</span>
            <span class="poi-actions">
              <button data-poi="${escapeAttr(p.id)}" data-move="${tier === "primary" ? "secondary" : "primary"}">
                → ${tier === "primary" ? "2°" : "1°"}
              </button>
            </span>
          </div>
        `).join("") || `<div class="poi-item" style="color:var(--text-muted)">None</div>`;

        el.querySelectorAll("button").forEach((btn) => {
          btn.addEventListener("click", () => movePoi(btn.dataset.poi, btn.dataset.move));
        });
      }

      renderList("primary-poi-list", "primary");
      renderList("secondary-poi-list", "secondary");
    }

    function renderMeta() {
      const { meta } = state.data;
      const visiblePois = [...state.selectedPois].filter((id) => isPoiVisible(id)).length;
      const pills = config.showPoiControls
        ? `<div class="stat-card"><div class="value">${visiblePois}</div><div class="label">POI hubs</div></div>`
        : "";
      const active = meta.activeTopicCount ?? state.nodes.filter((n) => isActiveTopic(n)).length;
      const passive = meta.passiveTopicCount ?? state.nodes.filter((n) => isPassiveTopic(n)).length;
      const el = fg("meta-pills");
      if (!el) return;
      el.innerHTML = `
        <div class="stats-grid sidebar-metrics">
          ${pills}
          <div class="stat-card"><div class="value">${meta.topicCount}</div><div class="label">Topics</div></div>
          <div class="stat-card"><div class="value">${active}</div><div class="label">Active</div></div>
          <div class="stat-card"><div class="value">${passive}</div><div class="label">Passive</div></div>
        </div>
      `;
    }

    function linkKey(l) {
      const s = typeof l.source === "object" ? l.source.id : l.source;
      const t = typeof l.target === "object" ? l.target.id : l.target;
      return `${s}|${t}`;
    }

    function getNeighborhood(id) {
      const nodeIds = new Set([id]);
      const linkKeys = new Set();

      function addIfVisible(nodeId) {
        if (!nodeId) return;
        const n = state.nodes.find((x) => x.id === nodeId);
        if (n && isNodeVisible(n) && isValidGraphCoord(n.x, n.y)) {
          nodeIds.add(nodeId);
        }
      }

      state.links.forEach((l) => {
        const s = typeof l.source === "object" ? l.source.id : l.source;
        const t = typeof l.target === "object" ? l.target.id : l.target;
        if (l.type === "post_link") {
          if (s === id) addIfVisible(t);
          if (t === id) addIfVisible(s);
          return;
        }
        if (s === id || t === id) {
          addIfVisible(s);
          addIfVisible(t);
          linkKeys.add(linkKey(l));
        }
      });
      if (id) {
        const node = state.nodes.find((n) => n.id === id);
        if (node?.type === "topic") {
          state.nodes
            .filter((n) => n.type === "post" && n.topic === id)
            .forEach((p) => addIfVisible(p.id));
        }
        if (node?.type === "poi") {
          state.links.forEach((l) => {
            if (l.type === "poi_topic") {
              const src = typeof l.source === "object" ? l.source.id : l.source;
              const tgt = typeof l.target === "object" ? l.target.id : l.target;
              if (src === id) addIfVisible(tgt);
              return;
            }
            if (l.type === "topic_parent") {
              const src = typeof l.source === "object" ? l.source.id : l.source;
              const tgt = typeof l.target === "object" ? l.target.id : l.target;
              if (tgt === id) addIfVisible(src);
            }
          });
        }
        if (node?.type === "topic" && isActiveTopic(node)) {
          state.links.forEach((l) => {
            if (l.type !== "topic_parent") return;
            const src = typeof l.source === "object" ? l.source.id : l.source;
            const tgt = typeof l.target === "object" ? l.target.id : l.target;
            if (tgt === id) addIfVisible(src);
          });
        }
      }
      return { nodeIds, linkKeys };
    }

    function computeFitScale(nodes, padding = 48, maxScale = 1.8) {
      const valid = nodes.filter((d) => isValidGraphCoord(d.x, d.y));
      if (!valid.length) return 1;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      valid.forEach((d) => {
        const r = simulationCollisionRadius(d);
        minX = Math.min(minX, d.x - r);
        minY = Math.min(minY, d.y - r);
        maxX = Math.max(maxX, d.x + r);
        maxY = Math.max(maxY, d.y + r);
      });
      const graphW = maxX - minX || 1;
      const graphH = maxY - minY || 1;
      return Math.min(
        (width - padding * 2) / graphW,
        (height - padding * 2) / graphH,
        maxScale
      ) * 0.92;
    }

    function fitGraphToView(animate = true) {
      const nodes = getFitNodes().filter((d) => isValidGraphCoord(d.x, d.y));
      if (!nodes.length) return;
      const padding = 48;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      nodes.forEach((d) => {
        const r = simulationCollisionRadius(d);
        minX = Math.min(minX, d.x - r);
        minY = Math.min(minY, d.y - r);
        maxX = Math.max(maxX, d.x + r);
        maxY = Math.max(maxY, d.y + r);
      });
      const midX = (minX + maxX) / 2;
      const midY = (minY + maxY) / 2;
      const scale = computeFitScale(nodes, padding, 1.8);
      const transform = d3.zoomIdentity
        .translate(width / 2, height / 2)
        .scale(scale)
        .translate(-midX, -midY);
      state.baselineZoom = scale;
      const sel = d3.select(canvas);
      if (animate) sel.transition().duration(450).call(zoomBehavior.transform, transform);
      else sel.call(zoomBehavior.transform, transform);
      updateZoomDisplay();
    }

    function focusOnNode(id, animate = true) {
      if (!id) return;
      const { nodeIds } = getNeighborhood(id);
      const nodes = state.nodes.filter((d) =>
        nodeIds.has(d.id) &&
        d.type !== "post" &&
        isNodeVisible(d) &&
        isValidGraphCoord(d.x, d.y)
      );
      if (!nodes.length) return;
      const padding = 64;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      nodes.forEach((d) => {
        const r = collisionRadius(d);
        minX = Math.min(minX, d.x - r);
        minY = Math.min(minY, d.y - r);
        maxX = Math.max(maxX, d.x + r);
        maxY = Math.max(maxY, d.y + r);
      });
      const graphW = maxX - minX || 1;
      const graphH = maxY - minY || 1;
      const midX = (minX + maxX) / 2;
      const midY = (minY + maxY) / 2;
      const focusScale = Math.min(
        (width - padding * 2) / graphW,
        (height - padding * 2) / graphH,
        2.5
      ) * 0.9;
      const minScale = computeFitScale(getFitNodes(), 48, 1.8);
      const scale = Math.max(focusScale, minScale);
      const transform = d3.zoomIdentity
        .translate(width / 2, height / 2)
        .scale(scale)
        .translate(-midX, -midY);
      const sel = d3.select(canvas);
      if (animate) sel.transition().duration(450).call(zoomBehavior.transform, transform);
      else sel.call(zoomBehavior.transform, transform);
    }

    function zoomBy(factor) {
      d3.select(canvas).transition().duration(200).call(
        zoomBehavior.scaleBy,
        factor,
        [width / 2, height / 2]
      );
    }

    function onSimTick() {
      buildQuadtree();
      if (state.simulation.alpha() > 0.015 || state.draggingNode) render();
    }

    function rebuildSimulation(alpha = 0.85) {
      if (state.simulation) state.simulation.stop();
      const layoutNodes = getLayoutNodes();
      state.simulation = d3.forceSimulation(layoutNodes)
        .alpha(alpha)
        .alphaMin(0.001)
        .on("tick", onSimTick)
        .on("end", () => {
          buildQuadtree();
          render();
          if (shouldAutoFit) {
            fitGraphToView(true);
            shouldAutoFit = false;
          }
        });
      applyLayoutForces();
      buildQuadtree();
      render();
    }

    function resolveGraphLinks() {
      state.nodeById = new Map(state.nodes.map((n) => [n.id, n]));
      state.links = state.data.links.map((l) => {
        const sourceId = typeof l.source === "object" ? l.source.id : l.source;
        const targetId = typeof l.target === "object" ? l.target.id : l.target;
        return {
          ...l,
          source: state.nodeById.get(sourceId) || sourceId,
          target: state.nodeById.get(targetId) || targetId,
        };
      });
    }

    function rebuildGraph() {
      const pinned = capturePinnedPois();
      selectNode(null);
      shouldAutoFit = true;
      state.nodes = state.data.nodes.map((n) => ({ ...n }));
      resolveGraphLinks();
      rebuildRadiusScales();
      seedNodePositions(pinned);
      rebuildSimulation(0.85);
    }

    function startGraph() {
      setupPageChrome();
      loadLayoutTuning();
      syncLayoutPanel();
      updateZoomDisplay();

      state.data = graphData;
      loadPoiTiers();
      renderMeta();
      renderPoiConfig();

      const loadingEl = fg("loading");
      if (loadingEl) loadingEl.classList.add("hidden");

      setupCanvas();
      requestAnimationFrame(() => {
        buildGraph();
        bindControls();
      });
    }

    function zoomFilter(event) {
      if (state.dragActive || state.draggingNode) return false;
      if (event.type === "wheel") return true;
      if (event.type === "dblclick") return false;
      if (event.shiftKey || event.button === 1) return true;
      const rect = canvas.getBoundingClientRect();
      const mx = (event.clientX ?? 0) - rect.left;
      const my = (event.clientY ?? 0) - rect.top;
      return !findNode(mx, my);
    }

    function setupCanvas() {
      canvas = fg("canvas");
      ctx = canvas.getContext("2d");
      resize();
      window.addEventListener("resize", () => { resize(); render(); });

      zoomBehavior = d3.zoom()
        .scaleExtent([0.04, 10])
        .filter(zoomFilter)
        .on("zoom", (event) => {
          state.transform = event.transform;
          updateZoomDisplay();
          render();
        });
      d3.select(canvas).call(zoomBehavior);

      canvas.addEventListener("pointerdown", onPointerDown, { capture: true });
      canvas.addEventListener("dblclick", onDoubleClick);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);

      const wrap = fg("canvas-wrap");
      if (wrap && typeof ResizeObserver !== "undefined") {
        state.resizeObserver = new ResizeObserver(() => {
          if (state.selectedId) {
            resize();
            focusOnNode(state.selectedId, false);
          } else {
            resize();
          }
        });
        state.resizeObserver.observe(wrap);
      }
    }

    function resize() {
      const dims = getGraphDimensions();
      width = dims.width;
      height = dims.height;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (state.simulation) {
        applyLayoutForces();
        state.simulation.alpha(0.3).restart();
      }
    }

    function buildGraph() {
      state.nodes = state.data.nodes.map((n) => ({ ...n }));
      resolveGraphLinks();
      rebuildRadiusScales();
      seedNodePositions();
      rebuildSimulation(0.85);
    }

    function buildQuadtree() {
      const visible = state.nodes.filter(isNodeVisible);
      state.quadtree = d3.quadtree()
        .x((d) => d.x)
        .y((d) => d.y)
        .addAll(visible);
    }

    function screenToGraph(mx, my) {
      const t = state.transform;
      return { x: (mx - t.x) / t.k, y: (my - t.y) / t.k };
    }

    function findNode(mx, my) {
      const { x, y } = screenToGraph(mx, my);
      const hitSlop = 10 / state.transform.k;
      const dragOrder = { post: 0, topic: 1, poi: 2 };

      if (state.quadtree) {
        let best = null;
        let bestRank = Infinity;
        let bestDist = Infinity;
        const searchRadius = 60 / state.transform.k;
        state.quadtree.visit((node, x0, y0, x1, y1) => {
          if (!node.length) {
            const d = node.data;
            if (!isNodeVisible(d)) return false;
            const r = Math.max(nodeRadius(d) + hitSlop, d.type === "poi" ? 14 / state.transform.k : 0);
            const dx = d.x - x;
            const dy = d.y - y;
            const dist = dx * dx + dy * dy;
            if (dist <= r * r) {
              const rank = dragOrder[d.type] ?? 3;
              if (rank < bestRank || (rank === bestRank && dist < bestDist)) {
                best = d;
                bestRank = rank;
                bestDist = dist;
              }
            }
          }
          return x0 > x + searchRadius || x1 < x - searchRadius || y0 > y + searchRadius || y1 < y - searchRadius;
        });
        return best;
      }

      let best = null;
      let bestRank = Infinity;
      let bestDist = Infinity;
      state.nodes.filter(isNodeVisible).forEach((d) => {
        const r = Math.max(nodeRadius(d) + hitSlop, d.type === "poi" ? 14 / state.transform.k : 0);
        const dx = d.x - x;
        const dy = d.y - y;
        const dist = dx * dx + dy * dy;
        if (dist > r * r) return;
        const rank = dragOrder[d.type] ?? 3;
        if (rank < bestRank || (rank === bestRank && dist < bestDist)) {
          best = d;
          bestRank = rank;
          bestDist = dist;
        }
      });
      return best;
    }

    function setDraggedNodePosition(node, nx, ny) {
      node.fx = nx;
      node.fy = ny;
      node.x = nx;
      node.y = ny;
      if (state.simulation) {
        if (!state.simulation.alphaTarget()) state.simulation.alphaTarget(0.25);
        state.simulation.alpha(0.3).restart();
      }
    }

    function releaseDraggedNode(node) {
      if (node.type === "poi") {
        node.fx = node.x;
        node.fy = node.y;
      } else {
        node.fx = null;
        node.fy = null;
      }
      if (state.simulation) {
        state.simulation.alphaTarget(0);
        state.simulation.alpha(0.35).restart();
      }
    }

    function canvasCoords(event) {
      const rect = canvas.getBoundingClientRect();
      return { mx: event.clientX - rect.left, my: event.clientY - rect.top };
    }

    function onPointerDown(event) {
      if (event.button !== 0) return;
      const { mx, my } = canvasCoords(event);
      const node = findNode(mx, my);

      if (isDraggableNode(node)) {
        state.draggingNode = node;
        state.dragActive = false;
        const { x, y } = screenToGraph(mx, my);
        state.dragOffset = { x: x - node.x, y: y - node.y };
        state.pointerDown = { mx, my, nodeId: node.id };
        if (state.simulation) state.simulation.alphaTarget(0.25).restart();
        if (event.pointerId != null && canvas.setPointerCapture) {
          canvas.setPointerCapture(event.pointerId);
        }
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      state.pointerDown = node ? { mx, my, nodeId: node.id } : { mx, my, nodeId: null };
    }

    function onPointerMove(event) {
      if (state.draggingNode) {
        const { mx, my } = canvasCoords(event);
        if (!state.dragActive && state.pointerDown) {
          const dx = mx - state.pointerDown.mx;
          const dy = my - state.pointerDown.my;
          if (Math.hypot(dx, dy) >= DRAG_THRESHOLD) state.dragActive = true;
        }
        if (state.dragActive) {
          const { x, y } = screenToGraph(mx, my);
          const node = state.draggingNode;
          setDraggedNodePosition(node, x - state.dragOffset.x, y - state.dragOffset.y);
          canvas.style.cursor = "grabbing";
          render();
        }
        return;
      }

      const now = performance.now();
      if (now - state.lastHoverRender < 32) return;
      state.lastHoverRender = now;

      const { mx, my } = canvasCoords(event);
      const node = findNode(mx, my);
      const nextHover = node ? node.id : null;
      if (nextHover === state.hoveredId) return;
      state.hoveredId = nextHover;
      canvas.style.cursor = isDraggableNode(node) ? "grab" : node ? "pointer" : "grab";
      render();
    }

    function onPointerUp(event) {
      if (state.draggingNode) {
        const node = state.draggingNode;
        if (state.dragActive) {
          releaseDraggedNode(node);
        } else if (state.pointerDown?.nodeId) {
          selectNode(state.pointerDown.nodeId);
        }
        if (canvas.hasPointerCapture?.(event.pointerId)) {
          canvas.releasePointerCapture(event.pointerId);
        }
        state.draggingNode = null;
        state.dragActive = false;
        state.pointerDown = null;
        render();
        return;
      }

      const { mx, my } = canvasCoords(event);
      if (state.pointerDown) {
        const dx = mx - state.pointerDown.mx;
        const dy = my - state.pointerDown.my;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) {
          selectNode(state.pointerDown.nodeId);
        }
      }
      state.pointerDown = null;
    }

    function onDoubleClick(event) {
      const { mx, my } = canvasCoords(event);
      const node = findNode(mx, my);
      if (!node || node.type !== "poi") return;
      event.preventDefault();
      node.fx = null;
      node.fy = null;
      restartLayoutSimulation(0.5);
      render();
    }

    function shouldShowLabel(d) {
      if (!state.showLabels) return false;
      if (!config.labelTypes.includes(d.type)) return false;
      if (!isNodeVisible(d)) return false;
      if (d.id === state.selectedId || d.id === state.hoveredId) return true;
      if (d.type === "topic") {
        return state.transform.k >= topicLabelThresholdK();
      }
      return true;
    }

    function bindDetailClicks(container) {
      container.querySelectorAll("[data-node]").forEach((el) => {
        el.addEventListener("click", () => selectNode(el.dataset.node));
      });
    }

    function selectNode(id) {
      state.selectedId = id;
      const app = fg("app");
      const enginePanel = fg("detail-panel-engine");
      const neighborhood = id ? getNeighborhood(id) : null;
      state.neighborhoodIds = neighborhood ? neighborhood.nodeIds : null;
      state.neighborhoodLinkKeys = neighborhood ? neighborhood.linkKeys : null;

      if (!id) {
        app.classList.remove("has-selection", "has-topic-selection", "has-poi-selection");
        if (enginePanel) enginePanel.innerHTML = "";
        if (onSelectNode) onSelectNode(null);
        requestAnimationFrame(() => {
          resize();
          fitGraphToView(true);
        });
        render();
        return;
      }

      const node = state.nodes.find((n) => n.id === id);
      if (!node) return;

      app.classList.add("has-selection");
      app.classList.toggle("has-topic-selection", node.type === "topic");
      app.classList.toggle("has-poi-selection", node.type === "poi");
      resize();

      if (node.type === "topic" && onSelectNode) {
        if (enginePanel) enginePanel.innerHTML = "";
        onSelectNode({
          id: node.id,
          type: node.type,
          title: node.title || node.id,
          category: node.category,
          topicType: node.topicType,
          postCount: node.postCount,
        });
        requestAnimationFrame(() => focusOnNode(id));
        render();
        return;
      }

      if (node.type === "post") {
        const d = state.data.postsDetail[id];
        if (enginePanel) {
          enginePanel.innerHTML = `
          <div class="detail-type">Post · ${escapeHtml(d.platform)}</div>
          <div class="detail-title">${escapeHtml(d.narrative || "Post")}</div>
          <div class="detail-body">
            <p><strong>Topic:</strong> ${escapeHtml(d.topic)}</p>
            <p><strong>Views:</strong> ${formatNum(d.views)} · <strong>Likes:</strong> ${formatNum(d.likes)}</p>
            ${d.isAi ? "<p><strong>AI-generated</strong></p>" : ""}
            ${d.flags.length ? `<p><strong>Flags:</strong> ${d.flags.join(", ")}</p>` : ""}
          </div>
          ${d.url ? `<a class="post-link" href="${escapeHtml(d.url)}" target="_blank" rel="noopener">Open post →</a>` : ""}
        `;
        }
      } else {
        const topics = state.links
          .filter((l) => {
            if (l.type !== "poi_topic") return false;
            const src = typeof l.source === "object" ? l.source.id : l.source;
            return src === id;
          })
          .map((l) => ({
            link: l,
            node: state.nodes.find((n) => n.id === (typeof l.target === "object" ? l.target.id : l.target)),
          }))
          .filter((x) => x.node)
          .sort((a, b) => (b.link.weight || 0) - (a.link.weight || 0));

        if (onSelectNode) onSelectNode(null);
        if (enginePanel) {
          enginePanel.innerHTML = `
          <div class="detail-type">${getPoiTier(id)} POI</div>
          <div class="detail-title">${escapeHtml(id)}</div>
          <div class="detail-body">
            <p>${node.postCount} post mentions across the dataset</p>
          </div>
          <div class="stats-grid">
            <div class="stat-card"><div class="value">${topics.length}</div><div class="label">Topics</div></div>
            <div class="stat-card"><div class="value">${node.postCount}</div><div class="label">Mentions</div></div>
          </div>
          <div class="posts-section">
            <h3>Linked topics</h3>
            ${topics.map(({ link, node: t }) => `
              <div class="post-card clickable" data-node="${escapeAttr(t.id)}">
                <div class="post-platform">${link.weight || 0} links</div>
                <div style="font-size:0.875rem;font-weight:700">${escapeHtml(t.title || t.id)}</div>
                <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px">${escapeHtml(t.id)} · ${t.postCount || 0} posts · ${escapeHtml(t.topicType || "active")}</div>
              </div>
            `).join("") || "<p style='color:var(--text-muted)'>None</p>"}
          </div>
        `;
          bindDetailClicks(enginePanel);
        }
      }

      requestAnimationFrame(() => focusOnNode(id));
      render();
    }

    function render() {
      const dpr = window.devicePixelRatio || 1;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const t = state.transform;
      ctx.translate(t.x, t.y);
      ctx.scale(t.k, t.k);

      const hasSelection = !!state.selectedId && state.neighborhoodIds;
      const nb = state.neighborhoodIds;
      const nbLinks = state.neighborhoodLinkKeys;

      function nodeAlpha(d) {
        if (!hasSelection) return 1;
        if (nb.has(d.id)) return 1;
        if (d.id === state.hoveredId) return 1;
        return 0.25;
      }

      function linkEndpoint(node, towardX, towardY) {
        const r = nodeRadius(node);
        const dx = towardX - node.x;
        const dy = towardY - node.y;
        const len = Math.hypot(dx, dy) || 1;
        return { x: node.x + (dx / len) * r, y: node.y + (dy / len) * r };
      }

      function linkAlpha(l) {
        if (!hasSelection) {
          return l.type === "post_link" ? 0.55 : 0.3;
        }
        const key = linkKey(l);
        if (nbLinks.has(key)) return 0.85;
        const s = typeof l.source === "object" ? l.source.id : l.source;
        const tg = typeof l.target === "object" ? l.target.id : l.target;
        if (nb.has(s) && nb.has(tg)) return 0.5;
        return l.type === "post_link" ? 0.12 : 0.08;
      }

      ctx.lineWidth = 1 / t.k;
      state.links.forEach((l) => {
        const s = typeof l.source === "object" ? l.source : state.nodes.find((n) => n.id === l.source);
        const tg = typeof l.target === "object" ? l.target : state.nodes.find((n) => n.id === l.target);
        if (!s || !tg) return;
        if (!isNodeVisible(s) || !isNodeVisible(tg)) return;
        if (l.type === "post_link" && !state.showPosts) return;
        const x1 = s.x;
        const y1 = s.y;
        const x2 = tg.x;
        const y2 = tg.y;
        ctx.beginPath();
        if (l.type === "post_link") {
          const from = linkEndpoint(s, tg.x, tg.y);
          const to = linkEndpoint(tg, s.x, s.y);
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
        } else {
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
        }
        if (l.type === "post_link") {
          ctx.strokeStyle = "#94a3b8";
          ctx.setLineDash([3 / t.k, 3 / t.k]);
        } else if (l.type === "topic_parent") {
          ctx.strokeStyle = "#c4b5fd";
          ctx.setLineDash([4 / t.k, 3 / t.k]);
        } else {
          ctx.strokeStyle = l.type === "poi_topic" ? "#93c5fd" : "#e2e8f0";
          ctx.setLineDash([]);
        }
        ctx.globalAlpha = linkAlpha(l);
        ctx.stroke();
      });
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      const drawOrder = ["post", "topic", "poi"];
      drawOrder.forEach((type) => {
        state.nodes.filter((n) => n.type === type && isNodeVisible(n)).forEach((d) => {
          const r = nodeRadius(d);
          const selected = d.id === state.selectedId;
          const hovered = d.id === state.hoveredId;
          const alpha = nodeAlpha(d);

          ctx.beginPath();
          ctx.arc(d.x, d.y, r, 0, Math.PI * 2);

          if (d.type === "post") {
            const ai = state.highlightAi && d.isAi;
            ctx.fillStyle = ai ? "#f59e0b" : (PLATFORM_COLORS[d.platform] || "#cbd5e1");
            ctx.globalAlpha = alpha * (ai ? 1 : 0.5);
          } else if (d.type === "topic") {
            ctx.fillStyle = isPassiveTopic(d) ? "#8b5cf6" : "#3b82f6";
            ctx.globalAlpha = alpha * 0.88;
          } else {
            ctx.fillStyle = d.tier === "primary" ? "#1e3a8a" : "#64748b";
            ctx.globalAlpha = alpha;
          }
          ctx.fill();
          ctx.globalAlpha = 1;

          const pinned = isPinnedPoi(d);
          const dragging = state.draggingNode && state.draggingNode.id === d.id && state.dragActive;
          ctx.strokeStyle = dragging ? "#1d4ed8" : selected || hovered ? "#1d4ed8" : pinned ? "#93c5fd" : "#ffffff";
          ctx.lineWidth = (dragging ? 3 : selected ? 2.5 : hovered || pinned ? 2 : 1.5) / t.k;
          ctx.globalAlpha = alpha;
          ctx.stroke();
          ctx.globalAlpha = 1;
        });
      });

      if (state.showLabels) {
        ctx.fillStyle = "#374151";
        state.nodes.filter((d) => config.labelTypes.includes(d.type) && isNodeVisible(d)).forEach((d) => {
          if (!shouldShowLabel(d)) return;
          const fontSize = d.type === "poi" ? 11 : 10;
          const alpha = nodeAlpha(d);
          ctx.globalAlpha = d.type === "topic" ? alpha * 0.85 : alpha;
          ctx.font = `700 ${fontSize / t.k}px Inter, sans-serif`;
          ctx.textAlign = "center";
          const maxLen = d.type === "poi" ? 22 : 36;
          const raw = nodeLabel(d);
          const label = raw.length > maxLen ? raw.slice(0, maxLen - 1) + "…" : raw;
          ctx.fillText(label, d.x, d.y + nodeRadius(d) + 14 / t.k);
          ctx.globalAlpha = 1;
        });
      }

      ctx.restore();
    }

    function bindControls() {
      fg("search").addEventListener("input", (e) => {
        clearTimeout(state.searchDebounceTimer);
        state.searchDebounceTimer = setTimeout(() => {
          state.searchQuery = e.target.value.trim();
          render();
        }, 200);
      });
      fg("show-labels").addEventListener("change", (e) => {
        state.showLabels = e.target.checked;
        render();
      });
      fg("zoom-fit").addEventListener("click", () => fitGraphToView(true));
      fg("zoom-in").addEventListener("click", () => zoomBy(1.28));
      fg("zoom-out").addEventListener("click", () => zoomBy(1 / 1.28));
      fg("layout-tuning-toggle").addEventListener("click", () => {
        fg("layout-tuning-panel").classList.toggle("hidden");
      });

      const layoutKeys = [
        "poiRepel", "topicRepel", "postRepel",
        "poiTopicAttract", "postTopicAttract",
        "collideStrength", "collisionScale", "repelDistanceMax", "gravity",
        "poiLinkBase", "poiLinkWeightBonus", "topicFanStep", "topicInitRadius",
        "postLinkDistance", "labelCharW", "topicLabelZoomPct",
      ];
      layoutKeys.forEach((key) => {
        const input = fg(`lt-${key}`);
        if (!input) return;
        input.addEventListener("input", () => {
          layoutTuning[key] = +input.value;
          syncLayoutPanel();
          saveLayoutTuning();
          updateZoomDisplay();
          if (key === "topicLabelZoomPct") render();
          else restartLayoutSimulation(0.4);
        });
      });

      fg("layout-tuning-reset").addEventListener("click", () => {
        layoutTuning = { ...DEFAULT_LAYOUT };
        syncLayoutPanel();
        saveLayoutTuning();
        rebuildGraph();
      });
      fg("layout-tuning-restart").addEventListener("click", () => rebuildGraph());
    }

    function escapeAttr(str) {
      return escapeHtml(str);
    }

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function formatNum(n) {
      if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
      if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
      return String(n);
    }

    let rafId = null;

    startGraph();

    const api = {
      clearSelection() {
        selectNode(null);
      },
    };

    function destroyPoiTopicsGraph() {
      if (state.simulation) state.simulation.stop();
      if (rafId) cancelAnimationFrame(rafId);
      clearTimeout(state.searchDebounceTimer);
      if (state.resizeObserver) state.resizeObserver.disconnect();
      if (canvas) {
        canvas.removeEventListener("pointerdown", onPointerDown, { capture: true });
        canvas.removeEventListener("dblclick", onDoubleClick);
      }
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    }

    api.destroy = destroyPoiTopicsGraph;
    return api;
}
