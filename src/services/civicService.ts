import { CivicIssueService } from "@/types/civic";
import { isSupabaseConfigured } from "./supabaseClient";
import { SupabaseCivicService } from "./supabaseCivicService";
import { MockCivicService } from "./mockCivicService";

const supabaseService = new SupabaseCivicService();
const mockService = new MockCivicService();

export const civicService: CivicIssueService = isSupabaseConfigured ? supabaseService : mockService;
