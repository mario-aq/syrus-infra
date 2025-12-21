package main

import (
	"testing"

	models "loros/syrus-models"
)

func TestValidateBlueprint(t *testing.T) {
	seeds := models.CampaignSeeds{
		BeatProfile: models.BeatProfile{
			Acts: 4,
			BeatsPerAct: models.MinMaxRange{
				Min: 8,
				Max: 12,
			},
			AvgMinutesPerBeat: 5,
		},
	}

	t.Run("valid blueprint", func(t *testing.T) {
		blueprint := &models.Blueprint{
			Title:   "Test Campaign",
			Premise: "A test premise for validation",
			ThematicPillars: []string{
				"Pillar One",
				"Pillar Two",
				"Pillar Three",
			},
			Acts: []models.Act{
				{ActNumber: 1, Name: "Act One"},
				{ActNumber: 2, Name: "Act Two"},
				{ActNumber: 3, Name: "Act Three"},
				{ActNumber: 4, Name: "Act Four"},
			},
		}

		err := validateBlueprint(blueprint, seeds)
		if err != nil {
			t.Errorf("Expected valid blueprint to pass validation, got error: %v", err)
		}
	})

	t.Run("missing title", func(t *testing.T) {
		blueprint := &models.Blueprint{
			Title:   "",
			Premise: "A test premise",
			ThematicPillars: []string{
				"Pillar One",
				"Pillar Two",
				"Pillar Three",
			},
			Acts: []models.Act{
				{ActNumber: 1},
				{ActNumber: 2},
				{ActNumber: 3},
				{ActNumber: 4},
			},
		}

		err := validateBlueprint(blueprint, seeds)
		if err == nil {
			t.Error("Expected error for missing title")
		}
	})

	t.Run("wrong number of thematic pillars", func(t *testing.T) {
		blueprint := &models.Blueprint{
			Title:           "Test Campaign",
			Premise:         "A test premise",
			ThematicPillars: []string{"Only One"},
			Acts: []models.Act{
				{ActNumber: 1},
				{ActNumber: 2},
				{ActNumber: 3},
				{ActNumber: 4},
			},
		}

		err := validateBlueprint(blueprint, seeds)
		if err == nil {
			t.Error("Expected error for wrong number of thematic pillars")
		}
	})

	t.Run("wrong number of acts", func(t *testing.T) {
		blueprint := &models.Blueprint{
			Title:   "Test Campaign",
			Premise: "A test premise",
			ThematicPillars: []string{
				"Pillar One",
				"Pillar Two",
				"Pillar Three",
			},
			Acts: []models.Act{
				{ActNumber: 1},
				{ActNumber: 2},
			},
		}

		err := validateBlueprint(blueprint, seeds)
		if err == nil {
			t.Error("Expected error for wrong number of acts")
		}
	})
}

func TestDetermineModel(t *testing.T) {
	t.Run("haiku model policy", func(t *testing.T) {
		campaign := &models.Campaign{
			ModelPolicy: models.ModelPolicy{
				Blueprint: "haiku",
			},
		}

		model := determineModel(campaign)
		if model != "haiku" {
			t.Errorf("Expected haiku, got %s", model)
		}
	})

	t.Run("sonnet model policy", func(t *testing.T) {
		campaign := &models.Campaign{
			ModelPolicy: models.ModelPolicy{
				Blueprint: "sonnet",
			},
		}

		model := determineModel(campaign)
		if model != "sonnet" {
			t.Errorf("Expected sonnet, got %s", model)
		}
	})

	t.Run("default to sonnet", func(t *testing.T) {
		campaign := &models.Campaign{
			ModelPolicy: models.ModelPolicy{
				Blueprint: "",
			},
		}

		model := determineModel(campaign)
		if model != "sonnet" {
			t.Errorf("Expected default sonnet, got %s", model)
		}
	})
}

func TestBuildPrompt(t *testing.T) {
	blueprintMsg := models.BlueprintMessage{
		CampaignID:    "test-campaign-123",
		InteractionID: "test-interaction-456",
		Seeds: models.CampaignSeeds{
			Objective: models.ObjectiveSeed{
				Name: "Test Objective",
			},
			BeatProfile: models.BeatProfile{
				Acts: 3,
				BeatsPerAct: models.MinMaxRange{
					Min: 10,
					Max: 15,
				},
				AvgMinutesPerBeat: 5,
			},
		},
	}

	campaign := &models.Campaign{
		CampaignID:   "test-campaign-123",
		CampaignType: "long",
		Party: models.Party{
			Members: []models.PartyMember{
				{UserID: "user-1"},
				{UserID: "user-2"},
			},
		},
	}

	prompt, err := buildPrompt(blueprintMsg, campaign)
	if err != nil {
		t.Fatalf("buildPrompt failed: %v", err)
	}

	// Check that key sections are present
	expectedSections := []string{
		"<configuration>",
		"<beatProfile>",
		"<availableBoons>",
		"<seedPackage>",
		"<exampleBlueprint>",
	}

	for _, section := range expectedSections {
		if !contains(prompt, section) {
			t.Errorf("Expected prompt to contain %s", section)
		}
	}
}

func contains(s, substr string) bool {
	return len(s) > 0 && len(substr) > 0 && (s == substr || len(s) >= len(substr) && (s[:len(substr)] == substr || contains(s[1:], substr)))
}
