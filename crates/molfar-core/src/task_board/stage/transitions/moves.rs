use super::{
    transition,
    types::{BoardAction, Move, Position},
};
use crate::task_board::constants::DONE;

/// `(action, probe, needs_input)`: the probe decides legality now, as on desktop.
const CANDIDATES: [(BoardAction, BoardAction, bool); 6] = [
    (BoardAction::Start, BoardAction::Start, false),
    (BoardAction::ApprovePlan, BoardAction::ApprovePlan, false),
    (
        BoardAction::RequestChanges,
        BoardAction::RequestChanges,
        true,
    ),
    (BoardAction::Rework, BoardAction::Rework, true),
    (BoardAction::Deliver, BoardAction::DeliverStart, true),
    (BoardAction::Back, BoardAction::Back, false),
];

pub fn legal_moves(card: Position<'_>) -> Vec<Move> {
    CANDIDATES
        .iter()
        .filter_map(|&(action, probe, needs_input)| {
            let next = transition(card, probe).ok()?;
            let column = if action == BoardAction::Deliver {
                DONE.to_owned()
            } else {
                next.column
            };
            (column != card.column).then_some(Move {
                column,
                action,
                needs_input,
            })
        })
        .collect()
}
