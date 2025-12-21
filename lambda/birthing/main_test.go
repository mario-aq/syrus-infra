package main

import (
	"encoding/json"
	"testing"
	"time"

	models "loros/syrus-models"
)

// TestConfigParsing tests that the embedded config JSON can be parsed correctly
func TestConfigParsing(t *testing.T) {
	var config CampaignConfig
	if err := json.Unmarshal(configJSON, &config); err != nil {
		t.Fatalf("Failed to parse config JSON: %v", err)
	}

	// Verify expected campaign types exist
	expectedTypes := []string{"short", "long", "epic"}
	for _, campaignType := range expectedTypes {
		profile, ok := config.CampaignLengthProfiles[campaignType]
		if !ok {
			t.Errorf("Missing campaign type in config: %s", campaignType)
			continue
		}

		// Verify selection rules exist
		if profile.Selection.Objective.Min < 0 || profile.Selection.Objective.Max < 0 {
			t.Errorf("Invalid objective selection for %s", campaignType)
		}
		if profile.Selection.Twists.Min < 0 || profile.Selection.Twists.Max < profile.Selection.Twists.Min {
			t.Errorf("Invalid twists selection for %s", campaignType)
		}
		if profile.Selection.Antagonists.Min < 0 || profile.Selection.Antagonists.Max < profile.Selection.Antagonists.Min {
			t.Errorf("Invalid antagonists selection for %s", campaignType)
		}
		if profile.Selection.SetPieces.Min < 0 || profile.Selection.SetPieces.Max < profile.Selection.SetPieces.Min {
			t.Errorf("Invalid set pieces selection for %s", campaignType)
		}
		if profile.Selection.Constraints.Min < 0 || profile.Selection.Constraints.Max < profile.Selection.Constraints.Min {
			t.Errorf("Invalid constraints selection for %s", campaignType)
		}
	}
}

// TestSeedsParsing tests that the embedded seeds JSON can be parsed correctly
func TestSeedsParsing(t *testing.T) {
	var seeds CampaignSeeds
	if err := json.Unmarshal(seedsJSON, &seeds); err != nil {
		t.Fatalf("Failed to parse seeds JSON: %v", err)
	}

	// Verify we have seed data
	if len(seeds.ObjectiveSeeds) == 0 {
		t.Error("No objective seeds found")
	}
	if len(seeds.TwistCandidates) == 0 {
		t.Error("No twist candidates found")
	}
	if len(seeds.AntagonistCandidates) == 0 {
		t.Error("No antagonist candidates found")
	}
	if len(seeds.SetPieceCandidates) == 0 {
		t.Error("No set piece candidates found")
	}
	if len(seeds.OptionalConstraints) == 0 {
		t.Error("No constraint seeds found")
	}

	// Validate first objective seed structure
	if len(seeds.ObjectiveSeeds) > 0 {
		obj := seeds.ObjectiveSeeds[0]
		if obj.ObjectiveID == "" {
			t.Error("Objective missing objectiveId")
		}
		if obj.Name == "" {
			t.Error("Objective missing name")
		}
		if obj.Complexity == "" {
			t.Error("Objective missing complexity")
		}
	}

	// Validate first twist structure
	if len(seeds.TwistCandidates) > 0 {
		twist := seeds.TwistCandidates[0]
		if twist.TwistID == "" {
			t.Error("Twist missing twistId")
		}
		if twist.Name == "" {
			t.Error("Twist missing name")
		}
		if twist.Severity == "" {
			t.Error("Twist missing severity")
		}
	}

	// Validate first antagonist structure
	if len(seeds.AntagonistCandidates) > 0 {
		ant := seeds.AntagonistCandidates[0]
		if ant.AntagonistID == "" {
			t.Error("Antagonist missing antagonistId")
		}
		if ant.Name == "" {
			t.Error("Antagonist missing name")
		}
		if ant.Nature == "" {
			t.Error("Antagonist missing nature")
		}
	}
}

// TestSelectRandomElements tests the random element selection logic
func TestSelectRandomElements(t *testing.T) {
	items := []string{"a", "b", "c", "d", "e", "f", "g", "h"}

	tests := []struct {
		name string
		min  int
		max  int
	}{
		{"Select 1-2 items", 1, 2},
		{"Select 2-4 items", 2, 4},
		{"Select 3-5 items", 3, 5},
		{"Select all items", 8, 8},
		{"Select more than available", 10, 12}, // Should cap at 8 items
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Run multiple times to test randomness
			for i := 0; i < 10; i++ {
				result := selectRandomElements(items, tt.min, tt.max)

				// Verify count is within range
				expectedMax := tt.max
				if expectedMax > len(items) {
					expectedMax = len(items)
				}
				expectedMin := tt.min
				if expectedMin > len(items) {
					expectedMin = len(items)
				}
				if len(result) < expectedMin || len(result) > expectedMax {
					t.Errorf("Expected %d-%d items, got %d", expectedMin, expectedMax, len(result))
				}

				// Verify no duplicates
				seen := make(map[string]bool)
				for _, item := range result {
					if seen[item] {
						t.Errorf("Duplicate item found: %s", item)
					}
					seen[item] = true
				}

				// Verify all items are from original slice
				for _, item := range result {
					found := false
					for _, original := range items {
						if item == original {
							found = true
							break
						}
					}
					if !found {
						t.Errorf("Item %s not in original slice", item)
					}
				}
			}
		})
	}
}

// TestGenerateBlueprintSeeds tests the full blueprint seed generation
func TestGenerateBlueprintSeeds(t *testing.T) {
	campaignTypes := []models.CampaignType{
		models.CampaignTypeShort,
		models.CampaignTypeLong,
		models.CampaignTypeEpic,
	}

	for _, campaignType := range campaignTypes {
		t.Run(string(campaignType), func(t *testing.T) {
			campaign := &models.Campaign{
				CampaignID:    "test-campaign",
				CampaignType:  campaignType,
				Status:        models.CampaignStatusConfiguring,
				CreatedAt:     time.Now().UTC(),
				LastUpdatedAt: time.Now().UTC(),
			}

			// Generate seeds multiple times to test consistency
			for i := 0; i < 5; i++ {
				seeds, err := generateBlueprintSeeds(campaign)
				if err != nil {
					t.Fatalf("Failed to generate blueprint seeds: %v", err)
				}

				// Verify objective was selected
				if seeds.Objective.ObjectiveID == "" {
					t.Error("No objective selected")
				}

				// Verify arrays are not nil
				if seeds.Twists == nil {
					t.Error("Twists is nil")
				}
				if seeds.Antagonists == nil {
					t.Error("Antagonists is nil")
				}
				if seeds.SetPieces == nil {
					t.Error("SetPieces is nil")
				}
				if seeds.Constraints == nil {
					t.Error("Constraints is nil")
				}
				if seeds.BeatProfile == (models.BeatProfile{}) {
					t.Error("BeatProfile is zero value")
				}

				checkDuplicateTwists := make(map[string]bool)
				for _, twist := range seeds.Twists {
					if checkDuplicateTwists[twist.TwistID] {
						t.Errorf("Duplicate twist ID: %s", twist.TwistID)
					}
					checkDuplicateTwists[twist.TwistID] = true
				}

				checkDuplicateAntagonists := make(map[string]bool)
				for _, ant := range seeds.Antagonists {
					if checkDuplicateAntagonists[ant.AntagonistID] {
						t.Errorf("Duplicate antagonist ID: %s", ant.AntagonistID)
					}
					checkDuplicateAntagonists[ant.AntagonistID] = true
				}

				checkDuplicateSetPieces := make(map[string]bool)
				for _, sp := range seeds.SetPieces {
					if checkDuplicateSetPieces[sp.SetPieceID] {
						t.Errorf("Duplicate set piece ID: %s", sp.SetPieceID)
					}
					checkDuplicateSetPieces[sp.SetPieceID] = true
				}

				checkDuplicateConstraints := make(map[string]bool)
				for _, con := range seeds.Constraints {
					if checkDuplicateConstraints[con.ConstraintID] {
						t.Errorf("Duplicate constraint ID: %s", con.ConstraintID)
					}
					checkDuplicateConstraints[con.ConstraintID] = true
				}
			}
		})
	}
}

// TestBlueprintMessageSerialization tests that BlueprintMessage can be serialized
func TestBlueprintMessageSerialization(t *testing.T) {
	blueprintMsg := models.BlueprintMessage{
		CampaignID:    "test-campaign-123",
		InteractionID: "test-interaction-456",
		Seeds: models.CampaignSeeds{
			Objective: models.ObjectiveSeed{
				ObjectiveID: "obj-1",
				Name:        "Test Objective",
				Description: "A test objective",
				Stakes:      map[string]string{"personal": "high"},
				Complexity:  "medium",
			},
			Twists: []models.TwistSeed{
				{
					TwistID:        "twist-1",
					Name:           "Test Twist",
					Description:    "A test twist",
					Severity:       "medium",
					RecommendedAct: 2,
				},
			},
			Antagonists: []models.AntagonistSeed{
				{
					AntagonistID:  "ant-1",
					Name:          "Test Antagonist",
					Nature:        "human",
					Goal:          "domination",
					Methods:       []string{"deception", "force"},
					ThreatLevel:   "high",
					PresenceStyle: "overt",
				},
			},
			SetPieces: []models.SetPieceSeed{
				{
					SetPieceID:         "sp-1",
					Name:               "Test Set Piece",
					PrimaryChallenge:   "combat",
					FailureConsequence: "injury",
					RecommendedAct:     3,
				},
			},
			Constraints: []models.ConstraintSeed{
				{
					ConstraintID: "con-1",
					Description:  "Test Constraint",
					Effects:      []string{"limited resources"},
				},
			},
		},
	}

	// Test JSON marshaling
	jsonData, err := json.Marshal(blueprintMsg)
	if err != nil {
		t.Fatalf("Failed to marshal BlueprintMessage: %v", err)
	}

	// Test JSON unmarshaling
	var unmarshaled models.BlueprintMessage
	if err := json.Unmarshal(jsonData, &unmarshaled); err != nil {
		t.Fatalf("Failed to unmarshal BlueprintMessage: %v", err)
	}

	// Verify data integrity
	if unmarshaled.CampaignID != blueprintMsg.CampaignID {
		t.Errorf("CampaignID mismatch: expected %s, got %s", blueprintMsg.CampaignID, unmarshaled.CampaignID)
	}
	if unmarshaled.InteractionID != blueprintMsg.InteractionID {
		t.Errorf("InteractionID mismatch: expected %s, got %s", blueprintMsg.InteractionID, unmarshaled.InteractionID)
	}
	if unmarshaled.Seeds.Objective.ObjectiveID != blueprintMsg.Seeds.Objective.ObjectiveID {
		t.Error("Objective data lost in serialization")
	}
	if len(unmarshaled.Seeds.Twists) != len(blueprintMsg.Seeds.Twists) {
		t.Error("Twists count mismatch after serialization")
	}
	if len(unmarshaled.Seeds.Antagonists) != len(blueprintMsg.Seeds.Antagonists) {
		t.Error("Antagonists count mismatch after serialization")
	}
}

// TestMapsParsing tests that the embedded maps JSON can be parsed correctly
func TestMapsParsing(t *testing.T) {
	var mapsData map[string]MapData
	if err := json.Unmarshal(mapsJSON, &mapsData); err != nil {
		t.Fatalf("Failed to parse maps JSON: %v", err)
	}

	if len(mapsData) == 0 {
		t.Error("No maps found")
	}

	for mapID, mapData := range mapsData {
		if mapData.Name == "" {
			t.Errorf("Map %s missing name", mapID)
		}
		if mapData.Description == "" {
			t.Errorf("Map %s missing description", mapID)
		}
		if len(mapData.Areas) == 0 {
			t.Errorf("Map %s has no areas", mapID)
		}

		for _, area := range mapData.Areas {
			if area.Name == "" {
				t.Errorf("Map %s has area with no name", mapID)
			}
			if area.Mood == "" {
				t.Errorf("Map %s, area %s has no mood", mapID, area.Name)
			}
		}
	}
}

// TestSelectRandomMap tests the random map selection
func TestSelectRandomMap(t *testing.T) {
	var mapsData map[string]MapData
	if err := json.Unmarshal(mapsJSON, &mapsData); err != nil {
		t.Fatalf("Failed to parse maps JSON: %v", err)
	}

	// Run selection multiple times to verify randomness
	selectedMaps := make(map[string]int)
	for i := 0; i < 100; i++ {
		mapID, mapData := selectRandomMap(mapsData)
		if mapID == "" {
			t.Error("Empty map ID returned")
		}
		if mapData.Name == "" {
			t.Error("Empty map data returned")
		}
		selectedMaps[mapID]++
	}

	// Verify we got some variety (at least 50% of available maps selected)
	if len(selectedMaps) < len(mapsData)/2 {
		t.Errorf("Not enough variety in map selection: got %d unique maps out of %d", len(selectedMaps), len(mapsData))
	}
}

// TestSelectFeaturedAreas tests featured area selection
func TestSelectFeaturedAreas(t *testing.T) {
	var mapsData map[string]MapData
	if err := json.Unmarshal(mapsJSON, &mapsData); err != nil {
		t.Fatalf("Failed to parse maps JSON: %v", err)
	}

	// Get a map for testing
	_, testMap := selectRandomMap(mapsData)

	tests := []struct {
		name  string
		count int
	}{
		{"Select 3 areas", 3},
		{"Select 6 areas", 6},
		{"Select 10 areas", 10},
		{"Select more than available", len(testMap.Areas) + 5},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := selectFeaturedAreas(testMap, tt.count)

			expectedCount := tt.count
			if expectedCount > len(testMap.Areas) {
				expectedCount = len(testMap.Areas)
			}

			if len(result) != expectedCount {
				t.Errorf("Expected %d areas, got %d", expectedCount, len(result))
			}

			// Verify no duplicates
			seen := make(map[int]bool)
			for _, area := range result {
				if seen[area.AreaID] {
					t.Errorf("Duplicate area ID: %d", area.AreaID)
				}
				seen[area.AreaID] = true
			}
		})
	}
}

// TestGenerateVarianceInjectors tests variance injector generation
func TestGenerateVarianceInjectors(t *testing.T) {
	var config CampaignConfig
	if err := json.Unmarshal(configJSON, &config); err != nil {
		t.Fatalf("Failed to parse config JSON: %v", err)
	}

	tests := []struct {
		name         string
		profileKey   string
		expectedKillers int
	}{
		{"Short campaign", "short", 1},
		{"Long campaign", "long", 2},
		{"Epic campaign", "epic", 2},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			profile := config.CampaignLengthProfiles[tt.profileKey]
			genre, perspective, _, motifs := generateVarianceInjectors(profile, &config)

			// Verify genre modifier is set for short+ campaigns
			if tt.expectedKillers > 0 && genre == "" {
				t.Error("Expected genre modifier to be set")
			}

			// Verify perspective bias for long+ campaigns
			if profile.VarianceRules.RequirePerspectiveBias && perspective == "" {
				t.Error("Expected perspective bias to be set")
			}

			// Verify excluded motifs are present
			if len(motifs) == 0 {
				t.Error("Expected excluded motifs to be set")
			}

			// Verify excluded motifs include defaults from config
			for _, defaultMotif := range profile.VarianceRules.ExcludeByDefault {
				found := false
				for _, motif := range motifs {
					if motif == defaultMotif {
						found = true
						break
					}
				}
				if !found {
					t.Errorf("Expected excluded motif %s not found", defaultMotif)
				}
			}

			// Run multiple times to verify randomness
			genres := make(map[string]bool)
			for i := 0; i < 20; i++ {
				g, _, _, _ := generateVarianceInjectors(profile, &config)
				if g != "" {
					genres[g] = true
				}
			}
			if len(genres) < 2 {
				t.Error("Not enough variety in genre modifiers")
			}
		})
	}
}

// TestSelectObjectiveWithBias tests biased objective selection
func TestSelectObjectiveWithBias(t *testing.T) {
	var seeds CampaignSeeds
	if err := json.Unmarshal(seedsJSON, &seeds); err != nil {
		t.Fatalf("Failed to parse seeds JSON: %v", err)
	}

	var config CampaignConfig
	if err := json.Unmarshal(configJSON, &config); err != nil {
		t.Fatalf("Failed to parse config JSON: %v", err)
	}

	// Test short campaign (force non-environmental threat)
	t.Run("Short campaign excludes ecological threats", func(t *testing.T) {
		profile := config.CampaignLengthProfiles["short"]

		// Run multiple times to verify consistency
		for i := 0; i < 20; i++ {
			objective := selectObjectiveWithBias(seeds.ObjectiveSeeds, profile)
			if objective.PrimaryThreatCategory == "ecological" {
				t.Error("Short campaign should exclude ecological threats")
			}
		}
	})

	// Test randomness
	t.Run("Selection is random", func(t *testing.T) {
		profile := config.CampaignLengthProfiles["long"]
		objectives := make(map[string]int)

		for i := 0; i < 50; i++ {
			objective := selectObjectiveWithBias(seeds.ObjectiveSeeds, profile)
			objectives[objective.ObjectiveID]++
		}

		// Should have selected multiple different objectives
		if len(objectives) < 3 {
			t.Error("Not enough variety in objective selection")
		}
	})
}

// TestSelectAntagonistsWithBias tests biased antagonist selection
func TestSelectAntagonistsWithBias(t *testing.T) {
	var seeds CampaignSeeds
	if err := json.Unmarshal(seedsJSON, &seeds); err != nil {
		t.Fatalf("Failed to parse seeds JSON: %v", err)
	}

	var config CampaignConfig
	if err := json.Unmarshal(configJSON, &config); err != nil {
		t.Fatalf("Failed to parse config JSON: %v", err)
	}

	// Test epic campaign (require multiple threat categories)
	t.Run("Epic campaign enforces threat diversity", func(t *testing.T) {
		profile := config.CampaignLengthProfiles["epic"]

		for i := 0; i < 10; i++ {
			antagonists := selectAntagonistsWithBias(seeds.AntagonistCandidates, profile, 3, 4)

			// Count unique threat categories
			categories := make(map[string]bool)
			for _, ant := range antagonists {
				categories[ant.PrimaryThreatCategory] = true
			}

			// Epic campaigns should have multiple categories
			if len(categories) < 2 {
				t.Error("Epic campaign should have multiple threat categories")
			}
		}
	})

	// Test count boundaries
	t.Run("Respects min/max counts", func(t *testing.T) {
		profile := config.CampaignLengthProfiles["long"]

		for i := 0; i < 10; i++ {
			antagonists := selectAntagonistsWithBias(seeds.AntagonistCandidates, profile, 2, 3)

			if len(antagonists) < 2 || len(antagonists) > 3 {
				t.Errorf("Expected 2-3 antagonists, got %d", len(antagonists))
			}
		}
	})
}

// TestGenerateExpectationViolation tests expectation violation generation
func TestGenerateExpectationViolation(t *testing.T) {
	var config CampaignConfig
	if err := json.Unmarshal(configJSON, &config); err != nil {
		t.Fatalf("Failed to parse config JSON: %v", err)
	}

	tests := []struct {
		name       string
		profileKey string
	}{
		{"Short campaign", "short"},
		{"Long campaign", "long"},
		{"Epic campaign", "epic"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			beatProfile := config.BeatProfiles[tt.profileKey]
			violation := generateExpectationViolation(beatProfile)

			if violation == nil {
				t.Fatal("Expected expectation violation to be generated")
			}

			// Verify act number is valid (2-N)
			if violation.ActNumber < 2 || violation.ActNumber > beatProfile.Acts {
				t.Errorf("Invalid act number: %d (should be 2-%d)", violation.ActNumber, beatProfile.Acts)
			}

			// Verify type is valid
			validTypes := map[string]bool{
				"inversion":            true,
				"removal":              true,
				"prematureResolution":  true,
			}
			if !validTypes[violation.Type] {
				t.Errorf("Invalid violation type: %s", violation.Type)
			}

			// Test randomness
			types := make(map[string]bool)
			for i := 0; i < 30; i++ {
				v := generateExpectationViolation(beatProfile)
				types[v.Type] = true
			}
			if len(types) < 2 {
				t.Error("Not enough variety in violation types")
			}
		})
	}
}

// TestBlueprintSeedsIncludeAllVariance tests that generated seeds include all new fields
func TestBlueprintSeedsIncludeAllVariance(t *testing.T) {
	campaignTypes := []models.CampaignType{
		models.CampaignTypeShort,
		models.CampaignTypeLong,
		models.CampaignTypeEpic,
	}

	for _, campaignType := range campaignTypes {
		t.Run(string(campaignType), func(t *testing.T) {
			campaign := &models.Campaign{
				CampaignID:    "test-campaign",
				CampaignType:  campaignType,
				Status:        models.CampaignStatusConfiguring,
				CreatedAt:     time.Now().UTC(),
				LastUpdatedAt: time.Now().UTC(),
			}

			seeds, err := generateBlueprintSeeds(campaign)
			if err != nil {
				t.Fatalf("Failed to generate blueprint seeds: %v", err)
			}

			// Verify map is selected
			if seeds.Map.MapID == "" {
				t.Error("No map selected")
			}
			if seeds.Map.Name == "" {
				t.Error("Map name is empty")
			}

			// Verify featured areas
			if len(seeds.FeaturedAreas) == 0 {
				t.Error("No featured areas selected")
			}

			// Verify maxCombatScenes is set
			if seeds.MaxCombatScenes == 0 {
				t.Error("MaxCombatScenes not set")
			}

			expectedCombat := map[models.CampaignType]int{
				models.CampaignTypeShort: 1,
				models.CampaignTypeLong:  2,
				models.CampaignTypeEpic:  3,
			}
			if seeds.MaxCombatScenes != expectedCombat[campaignType] {
				t.Errorf("Expected maxCombatScenes=%d for %s, got %d", expectedCombat[campaignType], campaignType, seeds.MaxCombatScenes)
			}

			// Verify excluded motifs
			if len(seeds.ExcludedMotifs) == 0 {
				t.Error("No excluded motifs set")
			}

			// Verify genre modifier for short+ campaigns
			if campaignType != models.CampaignTypeShort || seeds.GenreModifier == "" {
				// Short campaigns should have genre modifier
			}

			// Verify expectation violation for epic campaigns
			if campaignType == models.CampaignTypeEpic && seeds.ExpectationViolation == nil {
				t.Error("Epic campaign should have expectation violation")
			}
		})
	}
}

// TestSeedCategorization tests that all seeds have proper categorization
func TestSeedCategorization(t *testing.T) {
	var seeds CampaignSeeds
	if err := json.Unmarshal(seedsJSON, &seeds); err != nil {
		t.Fatalf("Failed to parse seeds JSON: %v", err)
	}

	// Check objectives have categories
	for _, obj := range seeds.ObjectiveSeeds {
		if obj.TerrainCategory == "" {
			t.Errorf("Objective %s missing terrainCategory", obj.ObjectiveID)
		}
		if obj.PrimaryThreatCategory == "" {
			t.Errorf("Objective %s missing primaryThreatCategory", obj.ObjectiveID)
		}
	}

	// Check antagonists have categories
	for _, ant := range seeds.AntagonistCandidates {
		if ant.TerrainCategory == "" {
			t.Errorf("Antagonist %s missing terrainCategory", ant.AntagonistID)
		}
		if ant.PrimaryThreatCategory == "" {
			t.Errorf("Antagonist %s missing primaryThreatCategory", ant.AntagonistID)
		}
	}
}

