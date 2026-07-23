import { useEffect } from 'react';
import { Video } from 'lucide-react';
import { useAppStore } from './state/store';
import { SetupScreen } from './components/SetupScreen';
import { RecordingScreen } from './components/RecordingScreen';
import { ReviewScreen } from './components/ReviewScreen';
import { LibraryScreen } from './components/LibraryScreen';

function App() {
  const { screen, setScreen, settings } = useAppStore();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="brand">
          <span className="dot" />
          StudioBubble
        </div>
        <div className="nav-tabs">
          <button className={screen === 'setup' ? 'active' : ''} onClick={() => setScreen('setup')}>
            Setup
          </button>
          <button className={screen === 'recording' ? 'active' : ''} disabled>
            Recording
          </button>
          <button className={screen === 'review' ? 'active' : ''} disabled={screen !== 'review'} onClick={() => screen === 'review' && setScreen('review')}>
            Review
          </button>
          <button className={screen === 'library' ? 'active' : ''} onClick={() => setScreen('library')}>
            Library
          </button>
        </div>
        <div className="row">
          <Video size={18} />
        </div>
      </div>

      {screen === 'setup' && <SetupScreen onStart={() => setScreen('recording')} />}
      {screen === 'recording' && <RecordingScreen onFinished={() => setScreen('review')} />}
      {screen === 'review' && <ReviewScreen onDone={() => setScreen('library')} />}
      {screen === 'library' && <LibraryScreen />}
    </div>
  );
}

export default App;
