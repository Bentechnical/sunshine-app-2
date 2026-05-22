'use client';

interface VolunteerVisitPrefsProps {
  openToIndividualVisits: boolean;
  setOpenToIndividualVisits: (v: boolean) => void;
  travelDistance: string;
  setTravelDistance: (v: string) => void;
  availableCategories: string[];
  selectedCategories: string[];
  setSelectedCategories: (v: string[]) => void;
  isLoading: boolean;
}

export default function VolunteerVisitPrefs({
  openToIndividualVisits,
  setOpenToIndividualVisits,
  travelDistance,
  setTravelDistance,
  availableCategories,
  selectedCategories,
  setSelectedCategories,
  isLoading,
}: VolunteerVisitPrefsProps) {
  const toggle = (category: string) => {
    if (selectedCategories.includes(category)) {
      setSelectedCategories(selectedCategories.filter((c) => c !== category));
    } else {
      setSelectedCategories([...selectedCategories, category]);
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">
        In addition to group visits with organizations, Sunshine also connects volunteers directly
        with community members for personal, one-on-one visits.
      </p>

      <label
        className={`flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${
          openToIndividualVisits
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-200 hover:border-gray-300 bg-white'
        }`}
      >
        <input
          type="checkbox"
          checked={openToIndividualVisits}
          onChange={(e) => setOpenToIndividualVisits(e.target.checked)}
          disabled={isLoading}
          className="mt-0.5 shrink-0"
        />
        <div>
          <p className="text-sm font-semibold text-gray-800">Open to individual visit requests</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Allow people seeking an individual therapy dog visit to find my profile and send me a request.
            You can change this at any time in your profile settings.
          </p>
        </div>
      </label>

      {openToIndividualVisits && (
        <>
          <div>
            <label htmlFor="travelDistance" className="block text-sm font-semibold text-gray-700 mb-2">
              How far will you travel for individual visits?
            </label>
            <select
              id="travelDistance"
              value={travelDistance}
              onChange={(e) => setTravelDistance(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg"
              disabled={isLoading}
            >
              <option value="5">5 km</option>
              <option value="10">10 km</option>
              <option value="25">25 km</option>
              <option value="50">50 km</option>
            </select>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-700 mb-1">Preferred populations</p>
            <p className="text-sm text-gray-500 mb-3">
              Select the populations you most enjoy working with for individual visits.
            </p>
            {availableCategories.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Loading categories...</p>
            ) : (
              <div className="space-y-2">
                {availableCategories.map((category) => (
                  <label key={category} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(category)}
                      onChange={() => toggle(category)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      disabled={isLoading}
                    />
                    <span className="text-sm text-gray-700">{category}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
