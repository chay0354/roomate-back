// api/handler.ts
import { handle } from "hono/vercel";

// src/app.ts
import { Hono as Hono9 } from "hono";
import { cors } from "hono/cors";

// src/routes/applications.ts
import { Hono } from "hono";
import { withSupabase } from "@supabase/server/adapters/hono";

// src/lib/errors.ts
function badRequest(c, message) {
  return c.json({ error: message }, 400);
}
function notFound(c, message = "Not found") {
  return c.json({ error: message }, 404);
}
function ok(c, data) {
  return c.json({ data });
}

// src/routes/applications.ts
var applicationRoutes = new Hono();
applicationRoutes.post("/", withSupabase({ auth: "user" }), async (c) => {
  const { supabase, userClaims } = c.var.supabaseContext;
  const body = await c.req.json();
  if (!body.apartment_id) return badRequest(c, "apartment_id is required");
  const { data, error } = await supabase.from("applications").insert({
    apartment_id: body.apartment_id,
    applicant_id: userClaims.id,
    message: body.message ?? null
  }).select("*").single();
  if (error) return badRequest(c, error.message);
  return ok(c, data);
});
applicationRoutes.get("/mine", withSupabase({ auth: "user" }), async (c) => {
  const { supabase, userClaims } = c.var.supabaseContext;
  const { data, error } = await supabase.from("applications").select("*, apartment:apartments(*, owner:profiles!apartments_owner_id_fkey(*))").eq("applicant_id", userClaims.id).order("created_at", { ascending: false });
  if (error) return badRequest(c, error.message);
  return ok(c, data);
});
applicationRoutes.get("/owner", withSupabase({ auth: "user" }), async (c) => {
  const { supabase, userClaims } = c.var.supabaseContext;
  const { data, error } = await supabase.from("applications").select(
    "*, apartment:apartments!inner(*), applicant:profiles!applications_applicant_id_fkey(*)"
  ).eq("apartment.owner_id", userClaims.id).order("created_at", { ascending: false });
  if (error) return badRequest(c, error.message);
  return ok(c, data);
});
applicationRoutes.post("/:id/approve", withSupabase({ auth: "user" }), async (c) => {
  const { supabase } = c.var.supabaseContext;
  const id = c.req.param("id");
  const { data, error } = await supabase.rpc("approve_application", {
    p_application_id: id
  });
  if (error) return badRequest(c, error.message);
  return ok(c, { conversation_id: data });
});
applicationRoutes.post("/:id/reject", withSupabase({ auth: "user" }), async (c) => {
  const { supabase } = c.var.supabaseContext;
  const id = c.req.param("id");
  const { error } = await supabase.rpc("reject_application", {
    p_application_id: id
  });
  if (error) return badRequest(c, error.message);
  return ok(c, { ok: true });
});

// src/routes/apartments.ts
import { Hono as Hono2 } from "hono";
import { withSupabase as withSupabase2 } from "@supabase/server/adapters/hono";

// src/lib/supabase-anon.ts
import { createClient } from "@supabase/supabase-js";
var anonClient = null;
function getAnonClient() {
  if (!anonClient) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY");
    }
    anonClient = createClient(url, key);
  }
  return anonClient;
}

// src/routes/apartments.ts
var apartmentRoutes = new Hono2();
var apartmentSelect = "*, owner:profiles!apartments_owner_id_fkey(*)";
apartmentRoutes.get("/", async (c) => {
  const neighborhood = c.req.query("neighborhood");
  const search = c.req.query("search");
  const supabase = getAnonClient();
  let query = supabase.from("apartments").select(apartmentSelect).eq("status", "open").order("created_at", { ascending: false });
  if (neighborhood) query = query.eq("neighborhood", neighborhood);
  if (search) {
    query = query.or(
      `title.ilike.%${search}%,address.ilike.%${search}%,neighborhood.ilike.%${search}%`
    );
  }
  const { data, error } = await query;
  if (error) return badRequest(c, error.message);
  return ok(c, data);
});
apartmentRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const supabase = getAnonClient();
  const { data, error } = await supabase.from("apartments").select(apartmentSelect).eq("id", id).single();
  if (error) return notFound(c, error.message);
  return ok(c, data);
});
apartmentRoutes.post("/", withSupabase2({ auth: "user" }), async (c) => {
  const { supabase, userClaims } = c.var.supabaseContext;
  const body = await c.req.json();
  const payload = {
    ...body,
    owner_id: userClaims.id
  };
  delete payload.id;
  const { data, error } = await supabase.from("apartments").insert(payload).select("*").single();
  if (error) return badRequest(c, error.message);
  return ok(c, data);
});

// src/routes/auth.ts
import { Hono as Hono3 } from "hono";
import { withSupabase as withSupabase3 } from "@supabase/server/adapters/hono";
var authRoutes = new Hono3();
authRoutes.post("/signup", async (c) => {
  const body = await c.req.json();
  if (!body.email || !body.password || body.password.length < 6) {
    return badRequest(c, "Email and password (min 6 chars) are required");
  }
  const supabase = getAnonClient();
  const { data, error } = await supabase.auth.signUp({
    email: body.email.trim(),
    password: body.password,
    options: {
      data: {
        full_name: body.full_name?.trim(),
        username: body.username?.trim(),
        phone: body.phone?.trim(),
        user_path: body.user_path ?? "dayer"
      }
    }
  });
  if (error) return badRequest(c, error.message);
  return ok(c, {
    session: data.session,
    user: data.user
  });
});
authRoutes.post("/signin", async (c) => {
  const body = await c.req.json();
  if (!body.email || !body.password) {
    return badRequest(c, "Email and password are required");
  }
  const supabase = getAnonClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: body.email.trim(),
    password: body.password
  });
  if (error) return badRequest(c, error.message);
  return ok(c, {
    session: data.session,
    user: data.user
  });
});
authRoutes.post("/refresh", async (c) => {
  const body = await c.req.json();
  if (!body.refresh_token) {
    return badRequest(c, "refresh_token is required");
  }
  const supabase = getAnonClient();
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: body.refresh_token
  });
  if (error) return badRequest(c, error.message);
  return ok(c, {
    session: data.session,
    user: data.user
  });
});
authRoutes.post("/signout", withSupabase3({ auth: "user" }), async (c) => {
  const { supabase } = c.var.supabaseContext;
  const { error } = await supabase.auth.signOut();
  if (error) return badRequest(c, error.message);
  return ok(c, { ok: true });
});

// src/routes/conversations.ts
import { Hono as Hono4 } from "hono";
import { withSupabase as withSupabase4 } from "@supabase/server/adapters/hono";

// src/lib/hono-context.ts
function getSupabaseContext(c) {
  return c.var.supabaseContext;
}

// src/routes/conversations.ts
var conversationRoutes = new Hono4();
conversationRoutes.use("*", withSupabase4({ auth: "user" }));
conversationRoutes.get("/", async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const userId = userClaims.id;
  const { data: memberRows, error: memberErr } = await supabase.from("conversation_members").select("conversation_id").eq("user_id", userId);
  if (memberErr) return badRequest(c, memberErr.message);
  const convIds = (memberRows ?? []).map((r) => r.conversation_id);
  if (convIds.length === 0) return ok(c, []);
  const { data, error } = await supabase.from("conversations").select("*, apartment:apartments(*), conversation_members(user_id, profile:profiles(*))").in("id", convIds).order("created_at", { ascending: false });
  if (error) return badRequest(c, error.message);
  const conversations = data ?? [];
  const results = await Promise.all(
    conversations.map(async (conv) => {
      const otherMember = conv.conversation_members?.find(
        (m) => m.user_id !== userId
      );
      const { data: lastMsg } = await supabase.from("messages").select("*").eq("conversation_id", conv.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return {
        ...conv,
        other_member: otherMember?.profile ?? null,
        last_message: lastMsg ?? null
      };
    })
  );
  results.sort((a, b) => {
    const aTime = a.last_message?.created_at ?? a.created_at;
    const bTime = b.last_message?.created_at ?? b.created_at;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });
  return ok(c, results);
});
conversationRoutes.get("/:id/messages", async (c) => {
  const { supabase } = getSupabaseContext(c);
  const conversationId = c.req.param("id");
  const { data, error } = await supabase.from("messages").select("*, sender:profiles(*)").eq("conversation_id", conversationId).order("created_at", { ascending: true });
  if (error) return badRequest(c, error.message);
  return ok(c, data);
});
conversationRoutes.post("/:id/messages", async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const conversationId = c.req.param("id");
  const body = await c.req.json();
  if (!body.body?.trim()) return badRequest(c, "Message body is required");
  const { data, error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: userClaims.id,
    body: body.body.trim()
  }).select("*").single();
  if (error) return badRequest(c, error.message);
  return ok(c, data);
});

// src/routes/favorites.ts
import { Hono as Hono5 } from "hono";
import { withSupabase as withSupabase5 } from "@supabase/server/adapters/hono";
var favoriteRoutes = new Hono5();
favoriteRoutes.use("*", withSupabase5({ auth: "user" }));
favoriteRoutes.get("/", async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const { data, error } = await supabase.from("favorites").select("*, apartment:apartments(*, owner:profiles!apartments_owner_id_fkey(*))").eq("user_id", userClaims.id).order("created_at", { ascending: false });
  if (error) return badRequest(c, error.message);
  return ok(c, data);
});
favoriteRoutes.get("/ids", async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const { data, error } = await supabase.from("favorites").select("apartment_id").eq("user_id", userClaims.id);
  if (error) return badRequest(c, error.message);
  const ids = (data ?? []).map((row) => row.apartment_id);
  return ok(c, ids);
});
favoriteRoutes.post("/:apartmentId", async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const apartmentId = c.req.param("apartmentId");
  const body = await c.req.json();
  if (body.is_favorite) {
    const { error } = await supabase.from("favorites").delete().eq("user_id", userClaims.id).eq("apartment_id", apartmentId);
    if (error) return badRequest(c, error.message);
  } else {
    const { error } = await supabase.from("favorites").insert({
      user_id: userClaims.id,
      apartment_id: apartmentId
    });
    if (error) return badRequest(c, error.message);
  }
  return ok(c, { ok: true });
});

// src/routes/meetings.ts
import { Hono as Hono6 } from "hono";
import { withSupabase as withSupabase6 } from "@supabase/server/adapters/hono";
var meetingRoutes = new Hono6();
meetingRoutes.use("*", withSupabase6({ auth: "user" }));
meetingRoutes.get("/", async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const userId = userClaims.id;
  const { data, error } = await supabase.from("meetings").select(
    "*, apartment:apartments(*), organizer:profiles!meetings_organizer_id_fkey(*), with_user:profiles!meetings_with_user_id_fkey(*)"
  ).or(`organizer_id.eq.${userId},with_user_id.eq.${userId}`).order("starts_at", { ascending: true });
  if (error) return badRequest(c, error.message);
  return ok(c, data);
});
meetingRoutes.post("/", async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const body = await c.req.json();
  const { data, error } = await supabase.from("meetings").insert({
    apartment_id: body.apartment_id,
    organizer_id: userClaims.id,
    with_user_id: body.with_user_id,
    starts_at: body.starts_at,
    notes: body.notes ?? null
  }).select("*").single();
  if (error) return badRequest(c, error.message);
  return ok(c, data);
});

// src/routes/notifications.ts
import { Hono as Hono7 } from "hono";
import { withSupabase as withSupabase7 } from "@supabase/server/adapters/hono";
var notificationRoutes = new Hono7();
notificationRoutes.use("*", withSupabase7({ auth: "user" }));
notificationRoutes.get("/", async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const { data, error } = await supabase.from("notifications").select("*").eq("user_id", userClaims.id).order("created_at", { ascending: false });
  if (error) return badRequest(c, error.message);
  return ok(c, data);
});
notificationRoutes.patch("/:id/read", async (c) => {
  const { supabase } = getSupabaseContext(c);
  const id = c.req.param("id");
  const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
  if (error) return badRequest(c, error.message);
  return ok(c, { ok: true });
});
notificationRoutes.post("/read-all", async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const { error } = await supabase.from("notifications").update({ read: true }).eq("user_id", userClaims.id).eq("read", false);
  if (error) return badRequest(c, error.message);
  return ok(c, { ok: true });
});

// src/routes/profiles.ts
import { Hono as Hono8 } from "hono";
import { withSupabase as withSupabase8 } from "@supabase/server/adapters/hono";
var profileRoutes = new Hono8();
profileRoutes.use("*", withSupabase8({ auth: "user" }));
profileRoutes.get("/", async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userClaims.id).single();
  if (error) return badRequest(c, error.message);
  return ok(c, data);
});
profileRoutes.patch("/", async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const patch = await c.req.json();
  delete patch.id;
  delete patch.created_at;
  delete patch.updated_at;
  const { data, error } = await supabase.from("profiles").update(patch).eq("id", userClaims.id).select("*").single();
  if (error) return badRequest(c, error.message);
  return ok(c, data);
});

// src/app.ts
function createApp() {
  const app2 = new Hono9();
  app2.use(
    "*",
    cors({
      origin: "*",
      allowHeaders: ["Content-Type", "Authorization", "apikey"],
      allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"]
    })
  );
  app2.get(
    "/health",
    (c) => c.json({
      ok: true,
      service: "roomate-api",
      architecture: "mobile -> api -> supabase"
    })
  );
  app2.route("/auth", authRoutes);
  app2.route("/apartments", apartmentRoutes);
  app2.route("/favorites", favoriteRoutes);
  app2.route("/applications", applicationRoutes);
  app2.route("/conversations", conversationRoutes);
  app2.route("/meetings", meetingRoutes);
  app2.route("/notifications", notificationRoutes);
  app2.route("/me/profile", profileRoutes);
  return app2;
}
var app = createApp();

// api/handler.ts
var handler_default = handle(app);
export {
  handler_default as default
};
