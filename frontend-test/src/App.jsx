import React, { useEffect, useRef } from 'react';
import HeroSection from './components/HeroSection';
import FeaturesSection from './components/FeaturesSection';
import WorkspaceSection from './components/WorkspaceSection';
import KnowledgeRepoSection from './components/KnowledgeRepoSection';
import AdminConsoleSection from './components/AdminConsoleSection';

function App() {
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    const scrollToRepo = () => {
      const repoEl = document.getElementById('knowledge-repo');
      if (repoEl) repoEl.scrollIntoView({ behavior: 'smooth' });
    };

    const scrollToWorkspace = () => {
      const workspaceEl = document.getElementById('workspace');
      if (workspaceEl) workspaceEl.scrollIntoView({ behavior: 'smooth' });
    };

    window.addEventListener('sentinel:scroll_to_repo', scrollToRepo);
    window.addEventListener('sentinel:replay', scrollToWorkspace);

    return () => {
      window.removeEventListener('sentinel:scroll_to_repo', scrollToRepo);
      window.removeEventListener('sentinel:replay', scrollToWorkspace);
    };
  }, []);

  return (
    <div className="scroll-container" ref={scrollContainerRef}>
      <HeroSection />
      <FeaturesSection />
      <WorkspaceSection />
      <KnowledgeRepoSection />
      <AdminConsoleSection />
    </div>
  );
}

export default App;
