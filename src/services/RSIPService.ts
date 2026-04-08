import PatternTree from '../models/PatternTree.js';
import type {
  AddPatternInput,
  AddPatternResult,
  DeletePatternResult,
  PatternTreeDocument
} from '../types/services.js';
import { generateId } from '../utils/index.js';

function todayStr(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

class RSIPService {
  /**
   * Add a new pattern node to the user's tree.
   * Enforces daily limit: only one new pattern per day by default.
   */
  async addPattern(userId: number, input: AddPatternInput): Promise<AddPatternResult> {
    const tree = await PatternTree.findOrCreateForUser(userId);
    const today = todayStr();

    // Check daily limit
    const todayNodes = tree.nodes.filter((n) => n.createdOn === today);
    if (todayNodes.length >= tree.limits.maxNewPatternsPerDay) {
      throw new Error('今日已添加过新定式');
    }

    // Validate parentId if provided
    if (input.parentId) {
      const parent = tree.nodes.find((n) => n.nodeId === input.parentId);
      if (!parent) {
        throw new Error(`父节点 ${input.parentId} 不存在`);
      }
    }

    const newNodeId = generateId('pn');
    const parentId = input.parentId ?? null;

    // Add the new node
    tree.nodes.push({
      nodeId: newNodeId,
      parentId,
      title: input.title,
      status: 'pending',
      createdOn: today,
      children: []
    });

    // Update parent's children array
    if (parentId) {
      const parent = tree.nodes.find((n) => n.nodeId === parentId);
      if (parent) {
        parent.children.push(newNodeId);
      }
    }

    await tree.save();

    // Re-fetch to get clean document
    const updatedTree = (await PatternTree.findById(tree._id))!;
    return { tree: updatedTree, newNodeId };
  }

  /**
   * Delete a pattern node and ALL its descendants using a stack (no recursion).
   * Updates the parent's children array to remove the deleted node reference.
   */
  async deletePatternStack(treeId: string, nodeId: string): Promise<DeletePatternResult> {
    const tree = await PatternTree.findOne({ treeId });
    if (!tree) {
      throw new Error(`定式树 ${treeId} 不存在`);
    }

    const targetNode = tree.nodes.find((n) => n.nodeId === nodeId);
    if (!targetNode) {
      throw new Error(`节点 ${nodeId} 不存在于定式树中`);
    }

    // Stack-based cascade: collect target + all descendants
    const removedNodeIds: string[] = [];
    const stack: string[] = [nodeId];

    while (stack.length > 0) {
      const currentId = stack.pop()!;
      removedNodeIds.push(currentId);

      const node = tree.nodes.find((n) => n.nodeId === currentId);
      if (node && node.children.length > 0) {
        for (const childId of node.children) {
          stack.push(childId);
        }
      }
    }

    // Remove all collected nodes from the nodes array
    const removedSet = new Set(removedNodeIds);
    tree.nodes = tree.nodes.filter((n) => !removedSet.has(n.nodeId));

    // Update parent's children array
    if (targetNode.parentId) {
      const parent = tree.nodes.find((n) => n.nodeId === targetNode.parentId);
      if (parent) {
        parent.children = parent.children.filter((id) => id !== nodeId);
      }
    }

    await tree.save();

    return { removedNodeIds };
  }

  /**
   * Get the user's pattern tree.
   */
  async getPatternTree(userId: number): Promise<PatternTreeDocument | null> {
    return PatternTree.findOne({ userId });
  }
}

export default RSIPService;
