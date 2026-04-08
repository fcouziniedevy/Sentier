const TRACK_COLOR_DEFAULT = '#f97316';

export default function Settings({ trackColor, onTrackColorChange }) {
  return (
    <div className="settings-page">
      <div className="settings-row">
        <label htmlFor="track-color">Track color</label>
        <input
          id="track-color"
          type="color"
          value={trackColor}
          onChange={(e) => onTrackColorChange(e.target.value)}
        />
        <button
          className="action-btn"
          onClick={() => onTrackColorChange(TRACK_COLOR_DEFAULT)}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
