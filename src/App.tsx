/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AppRoute } from './types';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { HomePage } from './components/pages/HomePage';
import { SolsticeThemePage } from './components/pages/SolsticeThemePage';
import { ScheduleVenuePage } from './components/pages/ScheduleVenuePage';
import { RulesPage } from './components/pages/RulesPage';
import { AboutVirtuosoPage } from './components/pages/AboutVirtuosoPage';
import { AboutSJCCPage } from './components/pages/AboutSJCCPage';
import { AboutDepartmentPage } from './components/pages/AboutDepartmentPage';
import { RegistrationPage } from './components/pages/RegistrationPage';
import { PaymentPage } from './components/pages/PaymentPage';
import { ContactPage } from './components/pages/ContactPage';
import { BrochurePage } from './components/pages/BrochurePage';
import { CinematicIntro } from './components/common/CinematicIntro';
import { SoundProvider, useSound } from './contexts/SoundContext';
import {
  hasSeenIntroInSession,
  markIntroSeenInSession,
  shouldShowIntroSequence,
} from './utils/experienceState';

function AppContent() {
  const { playNavigate } = useSound();

  const [prefersReducedMotion] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  const [showIntro, setShowIntro] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return shouldShowIntroSequence({
      search: window.location.search,
      prefersReducedMotion: reduced,
      hasSeenInSession: hasSeenIntroInSession(),
    });
  });

  const [introReady, setIntroReady] = useState<boolean>(false);

  const handleIntroReady = useCallback(() => {
    setIntroReady(true);
  }, []);

  const handleIntroComplete = useCallback(() => {
    markIntroSeenInSession();
    setShowIntro(false);
  }, []);

  const getInitialRoute = (): AppRoute => {
    if (typeof window === 'undefined') return 'home';

    const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
    const path = window.location.pathname.replace(/^\//, '').toLowerCase();

    const validRoutes: Record<string, AppRoute> = {
      '': 'home',
      'home': 'home',
      'about-virtuoso': 'about-virtuoso',
      'about-sjcc': 'about-sjcc',
      'about-department': 'about-department',
      'theme': 'theme',
      'solstice': 'theme',
      'schedule-venue': 'schedule-venue',
      'schedule': 'schedule-venue',
      'venue': 'schedule-venue',
      'rules': 'rules',
      'registration': 'registration',
      'register': 'registration',
      'payment': 'payment',
      'contact': 'contact',
      'brochure': 'brochure',
      'dossier': 'brochure',
    };

    if (hash && validRoutes[hash]) return validRoutes[hash];
    if (path && validRoutes[path]) return validRoutes[path];
    return 'home';
  };

  const [currentRoute, setCurrentRoute] = useState<AppRoute>(getInitialRoute);

  // Sync with browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      setCurrentRoute(getInitialRoute());
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  const handleRouteChange = (route: AppRoute) => {
    if (route !== currentRoute) {
      playNavigate();
    }
    setCurrentRoute(route);
    const targetHash = `#${route === 'home' ? '' : route}`;
    window.history.pushState(null, '', targetHash);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderCurrentView = () => {
    switch (currentRoute) {
      case 'home':
        return <HomePage onRouteChange={handleRouteChange} />;
      case 'theme':
        return <SolsticeThemePage onRouteChange={handleRouteChange} />;
      case 'schedule-venue':
        return <ScheduleVenuePage onRouteChange={handleRouteChange} />;
      case 'rules':
        return <RulesPage onRouteChange={handleRouteChange} />;
      case 'about-virtuoso':
        return <AboutVirtuosoPage onRouteChange={handleRouteChange} />;
      case 'about-sjcc':
        return <AboutSJCCPage onRouteChange={handleRouteChange} />;
      case 'about-department':
        return <AboutDepartmentPage onRouteChange={handleRouteChange} />;
      case 'registration':
        return <RegistrationPage onRouteChange={handleRouteChange} />;
      case 'payment':
        return <PaymentPage onRouteChange={handleRouteChange} />;
      case 'contact':
        return <ContactPage onRouteChange={handleRouteChange} />;
      case 'brochure':
        return <BrochurePage onRouteChange={handleRouteChange} />;
      default:
        return <HomePage onRouteChange={handleRouteChange} />;
    }
  };

  return (
    <div
      data-intro-ready={showIntro ? (introReady ? 'true' : 'false') : 'complete'}
      className="min-h-screen bg-[#200000] text-[#F0D18B] flex flex-col font-sans-clean antialiased selection:bg-[#B9873F]/40 selection:text-[#FFFFFF]"
    >
      {showIntro && (
        <CinematicIntro
          onComplete={handleIntroComplete}
          onReady={handleIntroReady}
          reducedMotion={prefersReducedMotion}
        />
      )}
      <Navbar currentRoute={currentRoute} onRouteChange={handleRouteChange} />
      <main className="flex-1">
        <div key={currentRoute} className="route-transition">
          {renderCurrentView()}
        </div>
      </main>
      <Footer onRouteChange={handleRouteChange} />
    </div>
  );
}

export default function App() {
  return (
    <SoundProvider>
      <AppContent />
    </SoundProvider>
  );
}
