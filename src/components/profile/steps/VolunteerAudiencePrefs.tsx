'use client';

interface VolunteerAudiencePrefsProps {
  availableCategories: string[];
  selectedCategories: string[];
  setSelectedCategories: (v: string[]) => void;
  isLoading: boolean;
}

export default function VolunteerAudiencePrefs({
  availableCategories,
  selectedCategories,
  setSelectedCategories,
  isLoading,
}: VolunteerAudiencePrefsProps) {
  const toggle = (category: string) => {
    if (selectedCategories.includes(category)) {
      setSelectedCategories(selectedCategories.filter((c) => c !== category));
    } else {
      setSelectedCategories([...selectedCategories, category]);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-1">Preferred Audience Categories</p>
        <p className="text-sm text-gray-600 mb-3">
          Select the types of individuals you'd prefer to work with. Leave blank if you're open to all.
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
    </div>
  );
}
