/**
 * OrchidLLM Login — Interactive Demo Logic
 * Handles view transitions, OAuth simulation, demo key generation,
 * and all interactive elements for the login page demo.
 *
 * Per plan: login.html → GitHub OAuth → session → redirect to index.html
 * Demo mode: generates a localStorage demo key (§17a)
 */

(function () {
  'use strict';

  // ===========================================
  // Falling M3E Shapes Background
  // ===========================================
  (function initFallingShapes() {
    const canvas = document.getElementById('bg-shapes');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let W, H;
    function resize() {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    // M3E-inspired shape palette (low opacity orchid / purple tones)
    const COLORS = [
      'rgba(159,134,255,0.07)',  // primary purple
      'rgba(203,195,255,0.06)',  // lighter purple
      'rgba(108,92,231,0.06)',   // deeper purple
      'rgba(206,147,216,0.05)', // orchid pink
      'rgba(237,184,208,0.05)', // tertiary pink
      'rgba(179,136,255,0.06)', // lavender
    ];

    // Shape types: 0=circle, 1=rounded-square, 2=diamond, 3=hexagon
    const SHAPE_COUNT = 30;
    const shapes = [];

    function createShape() {
      const size = 12 + Math.random() * 40;
      return {
        x: Math.random() * W,
        y: -size - Math.random() * H, // start above viewport, spread out
        size: size,
        type: Math.floor(Math.random() * 4),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        speed: 0.15 + Math.random() * 0.35,  // very slow fall
        drift: (Math.random() - 0.5) * 0.2,  // gentle horizontal sway
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.003,
        opacity: 0.4 + Math.random() * 0.6,
      };
    }

    // Pre-populate shapes across the full viewport height
    for (let i = 0; i < SHAPE_COUNT; i++) {
      const s = createShape();
      s.y = Math.random() * (H + 100) - 50; // spread across screen initially
      shapes.push(s);
    }

    function drawRoundedRect(cx, cy, size, r, rotation) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);
      const half = size / 2;
      const radius = Math.min(r, half);
      ctx.beginPath();
      ctx.moveTo(-half + radius, -half);
      ctx.lineTo(half - radius, -half);
      ctx.arcTo(half, -half, half, -half + radius, radius);
      ctx.lineTo(half, half - radius);
      ctx.arcTo(half, half, half - radius, half, radius);
      ctx.lineTo(-half + radius, half);
      ctx.arcTo(-half, half, -half, half - radius, radius);
      ctx.lineTo(-half, -half + radius);
      ctx.arcTo(-half, -half, -half + radius, -half, radius);
      ctx.closePath();
      ctx.restore();
    }

    function drawDiamond(cx, cy, size, rotation) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);
      const half = size / 2;
      ctx.beginPath();
      ctx.moveTo(0, -half);
      ctx.lineTo(half, 0);
      ctx.lineTo(0, half);
      ctx.lineTo(-half, 0);
      ctx.closePath();
      ctx.restore();
    }

    function drawHexagon(cx, cy, size, rotation) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);
      const half = size / 2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const px = Math.cos(angle) * half;
        const py = Math.sin(angle) * half;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.restore();
    }

    function drawShape(s) {
      ctx.fillStyle = s.color;
      ctx.globalAlpha = s.opacity;

      switch (s.type) {
        case 0: // Circle
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.size / 2, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 1: // Rounded square (M3 shape)
          drawRoundedRect(s.x, s.y, s.size, s.size * 0.25, s.rotation);
          ctx.fill();
          break;
        case 2: // Diamond
          drawDiamond(s.x, s.y, s.size, s.rotation);
          ctx.fill();
          break;
        case 3: // Hexagon
          drawHexagon(s.x, s.y, s.size, s.rotation);
          ctx.fill();
          break;
      }

      ctx.globalAlpha = 1;
    }

    function animate() {
      ctx.clearRect(0, 0, W, H);

      for (let i = 0; i < shapes.length; i++) {
        const s = shapes[i];
        s.y += s.speed;
        s.x += s.drift;
        s.rotation += s.rotationSpeed;

        // Reset when fallen below viewport
        if (s.y > H + s.size) {
          shapes[i] = createShape();
          shapes[i].y = -shapes[i].size - Math.random() * 60;
        }

        drawShape(s);
      }

      requestAnimationFrame(animate);
    }

    animate();
  })();

  // --- DOM References ---
  const views = {
    choose: document.getElementById('view-choose'),
    loading: document.getElementById('view-loading'),
    success: document.getElementById('view-success'),
    demo: document.getElementById('view-demo'),
  };

  const btnGitHub = document.getElementById('btn-github');
  const btnGoogle = document.getElementById('btn-google');
  const btnTryDemo = document.getElementById('btn-try-demo');
  const btnStartDemo = document.getElementById('btn-start-demo');
  const btnBackFromDemo = document.getElementById('btn-back-from-demo');
  const loadingText = document.getElementById('loading-text');
  const successUsername = document.getElementById('success-username');

  // --- View Transition System ---
  let currentView = 'choose';

  function switchView(targetName) {
    const current = views[currentView];
    const target = views[targetName];
    if (!current || !target || currentView === targetName) return;

    // Exit current
    current.classList.remove('active');
    current.classList.add('exiting');

    setTimeout(() => {
      current.classList.remove('exiting');
      current.style.display = 'none';

      // Enter target
      target.style.display = 'flex';
      target.classList.add('entering');

      setTimeout(() => {
        target.classList.remove('entering');
        target.classList.add('active');
        currentView = targetName;
      }, 400);
    }, 250);
  }

  // --- Snackbar ---
  function showSnackbar(message, duration = 3000) {
    let container = document.querySelector('.snackbar-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'snackbar-container';
      document.body.appendChild(container);
    }

    const snackbar = document.createElement('div');
    snackbar.className = 'snackbar';
    snackbar.textContent = message;
    container.innerHTML = '';
    container.appendChild(snackbar);

    setTimeout(() => {
      snackbar.classList.add('hiding');
      setTimeout(() => snackbar.remove(), 200);
    }, duration);
  }

  // --- Ripple effect on OAuth buttons ---
  function addRipple(button) {
    button.addEventListener('pointerdown', (e) => {
      if (button.disabled) return;

      const rect = button.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const size = Math.max(rect.width, rect.height) * 2;

      const ripple = document.createElement('span');
      ripple.style.cssText = `
        position: absolute;
        width: ${size}px; height: ${size}px;
        left: ${x - size / 2}px; top: ${y - size / 2}px;
        background: currentColor;
        opacity: 0.1;
        border-radius: 50%;
        transform: scale(0);
        animation: rippleAnim 500ms ease forwards;
        pointer-events: none;
      `;

      button.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    });
  }

  // Add ripple keyframes
  const rippleStyle = document.createElement('style');
  rippleStyle.textContent = `
    @keyframes rippleAnim {
      to { transform: scale(1); opacity: 0; }
    }
  `;
  document.head.appendChild(rippleStyle);

  // Attach ripples to all oauth buttons
  document.querySelectorAll('.oauth-btn').forEach(addRipple);

  // --- GitHub OAuth Simulation ---
  const DEMO_GITHUB_USERS = [
    { login: 'vendouple', name: 'johndoe', avatar: '' },
    { login: 'dev_orchid', name: 'Orchid Dev', avatar: '' },
  ];

  btnGitHub.addEventListener('click', () => {
    switchView('loading');
    loadingText.textContent = 'Connecting to GitHub…';

    // Simulate OAuth redirect delay
    setTimeout(() => {
      loadingText.textContent = 'Authenticating…';
    }, 1200);

    setTimeout(() => {
      loadingText.textContent = 'Creating session…';
    }, 2200);

    // Simulate successful auth
    setTimeout(() => {
      const user = DEMO_GITHUB_USERS[0];

      // Store demo session
      const session = {
        user_id: 'usr_' + crypto.randomUUID().slice(0, 8),
        username: user.login,
        display_name: user.name,
        provider: 'github',
        role: 'user',
        tier: 'free',
        logged_in_at: new Date().toISOString(),
      };

      localStorage.setItem('orchid_session', JSON.stringify(session));
      localStorage.setItem('orchid_auth_provider', 'github');

      successUsername.textContent = `@${user.login}`;
      switchView('success');

      // Redirect to dashboard (users.html) per plan: login → success → dashboard
      setTimeout(() => {
        window.location.href = 'users.html';
      }, 1500);
    }, 3200);
  });

  // --- Google (disabled) ---
  btnGoogle.addEventListener('click', () => {
    showSnackbar('Google OAuth coming in Phase 6');
  });

  // --- Demo Mode ---
  btnTryDemo.addEventListener('click', () => {
    switchView('demo');
  });

  btnBackFromDemo.addEventListener('click', () => {
    switchView('choose');
  });

  btnStartDemo.addEventListener('click', () => {
    // Generate demo key per §17a
    let demoKey = localStorage.getItem('orchid_demo_key');

    if (!demoKey) {
      demoKey = crypto.randomUUID();
      localStorage.setItem('orchid_demo_key', demoKey);
    }

    // Set cookie for persistence
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);
    document.cookie = `orchid_demo_key=${demoKey}; expires=${expiry.toUTCString()}; path=/; SameSite=Strict; Secure`;

    // Store demo session data
    const demoSession = {
      demo_key: demoKey,
      platform: /Mobi|Android/i.test(navigator.userAgent) ? 'web_mobile' : 'web_desktop',
      requests_today: 0,
      max_requests_day: 20,
      context_cap: 33000,
      model_access: 'demo',
      created_at: new Date().toISOString(),
    };

    localStorage.setItem('orchid_demo_session', JSON.stringify(demoSession));

    switchView('loading');
    loadingText.textContent = 'Setting up demo session…';

    setTimeout(() => {
      loadingText.textContent = 'Generating demo key…';
    }, 800);

    setTimeout(() => {
      showSnackbar(`Demo key: ${demoKey.slice(0, 8)}…`);
      switchView('success');
      successUsername.textContent = 'Demo User';

      // Demo users go to chat (index.html)
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 1500);
    }, 1800);
  });

  // --- Entrance animation stagger ---
  const card = document.getElementById('login-card');
  card.addEventListener('animationend', () => {
    // Stagger-animate child elements of the active view
    const activeView = document.querySelector('.login-view.active');
    if (!activeView) return;

    const children = activeView.children;
    Array.from(children).forEach((child, i) => {
      child.style.opacity = '0';
      child.style.transform = 'translateY(8px)';
      child.style.transition = `opacity 300ms ease ${i * 80 + 100}ms, transform 300ms ease ${i * 80 + 100}ms`;

      requestAnimationFrame(() => {
        child.style.opacity = '1';
        child.style.transform = 'translateY(0)';
      });
    });
  }, { once: true });

  // --- Keyboard navigation ---
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && currentView !== 'choose') {
      switchView('choose');
    }
  });

  // --- Logo hover interaction ---
  const logoContainer = document.getElementById('logo-container');
  logoContainer.addEventListener('mouseenter', () => {
    logoContainer.style.animation = 'none';
    logoContainer.style.transform = 'scale(1.12) rotate(5deg)';
    logoContainer.style.transition = 'transform 300ms cubic-bezier(0.2, 0, 0, 1)';
  });

  logoContainer.addEventListener('mouseleave', () => {
    logoContainer.style.transform = 'scale(1) rotate(0deg)';
    setTimeout(() => {
      logoContainer.style.animation = 'logoPulseIdle 3.5s ease-in-out infinite';
    }, 300);
  });

})();
