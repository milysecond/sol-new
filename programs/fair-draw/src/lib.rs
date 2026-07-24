//! sol.new Fair Draw — MagicBlock Solana VRF consumer.
//!
//! Flow:
//! 1. `request_draw` CPIs into MagicBlock VRF with caller_seed = draw id hash
//! 2. Oracle fulfills; VRF program CPIs into `callback_draw` with 32 random bytes
//! 3. Callback stores randomness on the Draw PDA for the web app to read
//!
//! Deploy: `anchor build && anchor deploy` from repo (see programs/fair-draw/README.md).

use anchor_lang::prelude::*;
use ephemeral_vrf_sdk::anchor::{vrf, vrf_callback};
use ephemeral_vrf_sdk::instructions::{
    create_request_high_priority_scoped_randomness_ix, RequestRandomnessParams,
};
use ephemeral_vrf_sdk::types::SerializableAccountMeta;

declare_id!("EQmor7iQN23PbKEUA9yHjsRujnb4csV9L8stussV3znp");

pub const DRAW_SEED: &[u8] = b"fair-draw";

/// MagicBlock base-layer default oracle queue.
pub const DEFAULT_QUEUE: Pubkey = pubkey!("Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh");

#[program]
pub mod fair_draw {
    use super::*;

    /// Initialize a draw PDA and request MagicBlock VRF randomness.
    /// `draw_id` is a 16-byte id from the web app (hex decoded).
    /// `caller_seed` mixes draw_id + entries_hash for domain separation.
    pub fn request_draw(
        ctx: Context<RequestDraw>,
        draw_id: [u8; 16],
        caller_seed: [u8; 32],
        entry_count: u32,
    ) -> Result<()> {
        require!(entry_count >= 2, FairDrawError::BadEntryCount);
        require!(entry_count <= 500, FairDrawError::BadEntryCount);

        let draw = &mut ctx.accounts.draw;
        draw.authority = ctx.accounts.payer.key();
        draw.draw_id = draw_id;
        draw.entry_count = entry_count;
        draw.randomness = [0u8; 32];
        draw.fulfilled = false;
        draw.bump = ctx.bumps.draw;

        msg!(
            "Fair draw request id={:?} entries={}",
            draw_id,
            entry_count
        );

        let ix = create_request_high_priority_scoped_randomness_ix(RequestRandomnessParams {
            payer: ctx.accounts.payer.key(),
            oracle_queue: ctx.accounts.oracle_queue.key(),
            callback_program_id: crate::ID,
            callback_discriminator: instruction::CallbackDraw::DISCRIMINATOR.to_vec(),
            caller_seed,
            accounts_metas: Some(vec![SerializableAccountMeta {
                pubkey: draw.key(),
                is_signer: false,
                is_writable: true,
            }]),
            ..Default::default()
        });

        ctx.accounts
            .invoke_signed_vrf(&ctx.accounts.payer.to_account_info(), &ix)?;
        Ok(())
    }

    /// Called only by MagicBlock VRF program identity after proof verification.
    pub fn callback_draw(ctx: Context<CallbackDraw>, randomness: [u8; 32]) -> Result<()> {
        let draw = &mut ctx.accounts.draw;
        require!(!draw.fulfilled, FairDrawError::AlreadyFulfilled);
        draw.randomness = randomness;
        draw.fulfilled = true;
        msg!("Fair draw fulfilled: {:?}", draw.draw_id);
        Ok(())
    }
}

#[account]
pub struct Draw {
    pub authority: Pubkey,
    pub draw_id: [u8; 16],
    pub entry_count: u32,
    pub randomness: [u8; 32],
    pub fulfilled: bool,
    pub bump: u8,
}

impl Draw {
    pub const LEN: usize = 8 + 32 + 16 + 4 + 32 + 1 + 1;
}

#[vrf]
#[derive(Accounts)]
#[instruction(draw_id: [u8; 16])]
pub struct RequestDraw<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = Draw::LEN,
        seeds = [DRAW_SEED, draw_id.as_ref()],
        bump
    )]
    pub draw: Account<'info, Draw>,
    /// CHECK: MagicBlock oracle queue (base layer DEFAULT_QUEUE)
    #[account(mut, address = DEFAULT_QUEUE)]
    pub oracle_queue: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    // #[vrf] injects: program_identity, vrf_program, slot_hashes
}

/// Scoped VRF identity (default for SDK 0.4.x) authenticates the oracle callback.
#[vrf_callback]
#[derive(Accounts)]
pub struct CallbackDraw<'info> {
    // #[vrf_callback] injects scoped vrf_program_identity: Signer
    #[account(mut, seeds = [DRAW_SEED, draw.draw_id.as_ref()], bump = draw.bump)]
    pub draw: Account<'info, Draw>,
}

#[error_code]
pub enum FairDrawError {
    #[msg("entry_count must be 2–500")]
    BadEntryCount,
    #[msg("draw already fulfilled")]
    AlreadyFulfilled,
}
