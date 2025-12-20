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
