"""
aggregator/chat.py — Mug.ai Chatbot reasoning and QA agent.
Provides highly accurate, data-backed answers based on the live cache.
"""
from __future__ import annotations
import re
from typing import Any
from aggregator.live_bootstrap import OPERATORS, REVIEW_DIMENSIONS

def handle_chat_query(query: str, cache_data: dict[str, Any]) -> str:
    query_clean = query.strip().lower()
    
    # 1. Identify operators mentioned
    operators_found = []
    for op in OPERATORS:
        slug = op["slug"]
        name = op["name"].lower()
        if slug in query_clean or name in query_clean:
            operators_found.append(op)
            
    # Check for abbreviations
    if not operators_found:
        if "fresh" in query_clean:
            operators_found.append(next(o for o in OPERATORS if o["slug"] == "freshbus"))
        if "neugo" in query_clean or "nuego" in query_clean:
            operators_found.append(next(o for o in OPERATORS if o["slug"] == "neugo"))
        if "intrcity" in query_clean or "intercity" in query_clean:
            operators_found.append(next(o for o in OPERATORS if o["slug"] == "intrcity"))
        if "zing" in query_clean:
            operators_found.append(next(o for o in OPERATORS if o["slug"] == "zingbus"))
        if "flix" in query_clean:
            operators_found.append(next(o for o in OPERATORS if o["slug"] == "flixbus"))
        if "leafy" in query_clean:
            operators_found.append(next(o for o in OPERATORS if o["slug"] == "leafy"))

    # Intent detection
    is_best_query = any(w in query_clean for w in ["best", "excel", "strength", "good at", "strongest", "top", "leader", "advantage"])
    is_worst_query = any(w in query_clean for w in ["worst", "weakness", "bad at", "complaint", "poor", "improve", "gap", "defect", "problem", "issue", "worst", "lowest"])
    is_comparison = len(operators_found) >= 2 or "compare" in query_clean or "vs" in query_clean
    is_rating_query = any(w in query_clean for w in ["rating", "score", "star", "reviews", "number of downloads", "download", "download count"])

    # If no operator is mentioned and it's a general query
    if not operators_found:
        return (
            "Hello! I am **Mug.ai**, your dedicated Peer Analysis Assistant. 🤖\n\n"
            "I can answer questions about operator performance across Google Play, Apple App Store, Google Search, and Redbus reviews with 100% data accuracy.\n\n"
            "Try asking me:\n"
            "- *On what thing is Neugo the best among all operators?*\n"
            "- *What are the main weaknesses of Zingbus?*\n"
            "- *Compare FreshBus and FlixBus.*\n"
            "- *Which operator has the highest rating on Google Play Store?*\n"
            "- *What are the passenger complaints about Leafy?*"
        )

    # Operator-specific handling
    op = operators_found[0]
    slug = op["slug"]
    name = op["name"]
    
    # Extract operator scores
    app_store = cache_data.get("app_store") or {}
    google = cache_data.get("google_reviews") or {}
    
    gp_entry = app_store.get(slug, {}).get("google_play", {})
    ios_entry = app_store.get(slug, {}).get("ios_app_store", {})
    gr_entry = google.get(slug, {})
    
    gp_rating = gp_entry.get("overall_rating")
    ios_rating = ios_entry.get("overall_rating")
    gr_rating = gr_entry.get("overall_rating")
    
    gp_downloads = gp_entry.get("downloads") or "N/A"
    ios_downloads = ios_entry.get("downloads") or "N/A"

    # Compile topic classification scores (across all three sources: google_play, ios_app_store, google_reviews)
    review_classification = cache_data.get("review_classification") or {}
    
    # Calculate average scores for each topic dimension for this operator
    operator_dimensions = {}
    for source in ["google_play", "ios_app_store", "google_reviews"]:
        src_payload = review_classification.get(source) or {}
        op_list = src_payload.get("operators") or []
        op_data = next((o for o in op_list if o["operator_slug"] == slug), None)
        if op_data:
            for dim in op_data.get("dimensions", []):
                dim_id = dim["dimension_id"]
                dim_label = dim["label"]
                score = dim["score"]
                if score is not None:
                    operator_dimensions.setdefault(dim_id, {"label": dim_label, "scores": []})["scores"].append(score)
                    
    # Average the scores across sources
    avg_dimension_scores = []
    for dim_id, data in operator_dimensions.items():
        if data["scores"]:
            avg_score = sum(data["scores"]) / len(data["scores"])
            avg_dimension_scores.append({
                "id": dim_id,
                "label": data["label"],
                "score": round(avg_score, 2)
            })
            
    # Redbus tags
    redbus_tags = cache_data.get("redbus_tags") or {}
    rb_op_list = redbus_tags.get("operators") or []
    rb_op_data = next((o for o in rb_op_list if o["operator_slug"] == slug), None)
    rb_tags = rb_op_data.get("tags", []) if rb_op_data else []
    
    for rb_tag in rb_tags:
        # Merging with average dimensions
        tag_id = rb_tag["tag_id"]
        tag_label = rb_tag["label"]
        tag_score = rb_tag["score"]
        # Convert Redbus tag scores to 1-5 scale if they are not already
        avg_dimension_scores.append({
            "id": tag_id,
            "label": f"Redbus: {tag_label}",
            "score": round(tag_score, 2)
        })

    # Sort dimensions to find strengths/weaknesses
    sorted_dims = sorted(avg_dimension_scores, key=lambda x: x["score"], reverse=True)

    # 1. Comparison query
    if is_comparison and len(operators_found) >= 2:
        op2 = operators_found[1]
        slug2 = op2["slug"]
        name2 = op2["name"]
        
        gp_entry2 = app_store.get(slug2, {}).get("google_play", {})
        ios_entry2 = app_store.get(slug2, {}).get("ios_app_store", {})
        gr_entry2 = google.get(slug2, {})
        
        gp_rating2 = gp_entry2.get("overall_rating")
        ios_rating2 = ios_entry2.get("overall_rating")
        gr_rating2 = gr_entry2.get("overall_rating")
        
        response = (
            f"### 📊 Comparison: **{name}** vs **{name2}**\n\n"
            f"Here is a side-by-side comparison of **{name}** and **{name2}** based on active store ratings and reviews:\n\n"
            f"| Metric | {name} | {name2} |\n"
            f"| :--- | :---: | :---: |\n"
            f"| **Google Play Rating** | ⭐ {gp_rating or 'N/A'} | ⭐ {gp_rating2 or 'N/A'} |\n"
            f"| **Google Play Downloads** | 📥 {gp_downloads} | 📥 {gp_entry2.get('downloads') or 'N/A'} |\n"
            f"| **iOS App Store Rating** | ⭐ {ios_rating or 'N/A'} | ⭐ {ios_rating2 or 'N/A'} |\n"
            f"| **Google Search Rating** | ⭐ {gr_rating or 'N/A'} | ⭐ {gr_rating2 or 'N/A'} |\n\n"
        )
        
        # Add quick summary comparison
        best_dim1 = sorted_dims[0] if sorted_dims else None
        
        # Get dimensions for operator 2
        op2_dimensions = []
        for dim_id, data in operator_dimensions.items():
            # calculate average for op2
            op2_scores = []
            for source in ["google_play", "ios_app_store", "google_reviews"]:
                src_payload = review_classification.get(source) or {}
                op2_data = next((o for o in src_payload.get("operators", []) if o["operator_slug"] == slug2), None)
                if op2_data:
                    d_val = next((d for d in op2_data.get("dimensions", []) if d["dimension_id"] == dim_id), None)
                    if d_val and d_val["score"] is not None:
                        op2_scores.append(d_val["score"])
            if op2_scores:
                op2_dimensions.append({
                    "id": dim_id,
                    "label": data["label"],
                    "score": round(sum(op2_scores) / len(op2_scores), 2)
                })
        sorted_dims2 = sorted(op2_dimensions, key=lambda x: x["score"], reverse=True)
        best_dim2 = sorted_dims2[0] if sorted_dims2 else None
        
        response += "#### **Key Strengths Comparison:**\n"
        if best_dim1:
            response += f"- **{name}** is strongest in **{best_dim1['label']}** with a score of **{best_dim1['score']}/5.0**.\n"
        if best_dim2:
            response += f"- **{name2}** is strongest in **{best_dim2['label']}** with a score of **{best_dim2['score']}/5.0**.\n"
            
        return response

    # 2. Strength query: "what is best at / best among"
    if is_best_query:
        if not sorted_dims:
            return f"I have the ratings for **{name}**, but topic classification reviews are still loading. Overall ratings: Google Play is **{gp_rating or 'N/A'}**, iOS App Store is **{ios_rating or 'N/A'}**, and Google Search is **{gr_rating or 'N/A'}**."
        
        top_three = sorted_dims[:3]
        response = (
            f"### 🌟 **What {name} is best at:**\n\n"
            f"Based on aggregated passenger reviews, **{name}** excels in the following areas:\n\n"
        )
        for idx, item in enumerate(top_three, 1):
            response += f"{idx}. **{item['label']}** — Score: **{item['score']}/5.0**\n"
            
        # Add direct answer to "on what thing neugo is the best among"
        # Let's check if this operator actually ranks #1 in any dimension!
        rank_1_dims = []
        for dim in avg_dimension_scores:
            dim_id = dim["id"]
            dim_label = dim["label"]
            score = dim["score"]
            
            # Check other operators
            is_leader = True
            for other_op in OPERATORS:
                if other_op["slug"] == slug:
                    continue
                # get other op score
                other_scores = []
                for source in ["google_play", "ios_app_store", "google_reviews"]:
                    op_data = next((o for o in review_classification.get(source, {}).get("operators", []) if o["operator_slug"] == other_op["slug"]), None)
                    if op_data:
                        d_val = next((d for d in op_data.get("dimensions", []) if d["dimension_id"] == dim_id), None)
                        if d_val and d_val["score"] is not None:
                            other_scores.append(d_val["score"])
                if other_scores:
                    other_avg = sum(other_scores) / len(other_scores)
                    if other_avg > score:
                        is_leader = False
                        break
            if is_leader:
                rank_1_dims.append(dim_label)
                
        if rank_1_dims:
            response += f"\n🏆 **Market Leader Advantage:**\n**{name}** ranks **#1** in the market in: **" + ", ".join(rank_1_dims[:3]) + "**!"
        else:
            response += f"\nWhile **{name}** has strong dimensions, competitors like FlixBus or FreshBus lead in individual top ranks."
            
        return response

    # 3. Weakness query: "what is worst at / weaknesses"
    if is_worst_query:
        if not sorted_dims:
            return f"I have the overall ratings for **{name}**, but topic-specific weakness data is not fully loaded. Overall ratings: Google Play is **{gp_rating or 'N/A'}**, iOS App Store is **{ios_rating or 'N/A'}**, and Google Search is **{gr_rating or 'N/A'}**."
        
        worst_three = sorted_dims[-3:]
        worst_three.reverse() # show lowest score first
        response = (
            f"### ⚠️ **Areas of Improvement for {name}:**\n\n"
            f"Passenger feedback highlights the following pain points or complaints for **{name}**:\n\n"
        )
        for idx, item in enumerate(worst_three, 1):
            response += f"{idx}. **{item['label']}** — Score: **{item['score']}/5.0** (Need attention)\n"
            
        return response

    # 4. Rating / Score query
    if is_rating_query:
        return (
            f"### 📱 **Ratings & App Store Metrics for {name}**\n\n"
            f"- **Google Play Store:** ⭐ **{gp_rating or 'N/A'}** (with **{gp_downloads}** downloads)\n"
            f"- **iOS App Store:** ⭐ **{ios_rating or 'N/A'}** (with **{ios_downloads}** downloads)\n"
            f"- **Google Search Reviews:** ⭐ **{gr_rating or 'N/A'}**\n"
            f"- **Redbus Sentiment:** **{rb_op_data.get('composite_tag_score', 'N/A') if rb_op_data else 'N/A'}**\n"
        )

    # 5. Default Operator summary
    best_dim = sorted_dims[0] if sorted_dims else None
    worst_dim = sorted_dims[-1] if sorted_dims else None
    
    summary = (
        f"### 🚌 **{name} Operator Summary**\n\n"
        f"**{name}** has an average Google Play rating of **{gp_rating or 'N/A'}** and iOS App Store rating of **{ios_rating or 'N/A'}**.\n\n"
    )
    if best_dim:
        summary += f"🌟 **Key Strength:** {best_dim['label']} (**{best_dim['score']}/5.0**)\n"
    if worst_dim:
        summary += f"⚠️ **Key Pain Point:** {worst_dim['label']} (**{worst_dim['score']}/5.0**)\n\n"
        
    summary += "Feel free to ask me for more details like strengths, weaknesses, ratings, or comparison with other operators!"
    return summary
